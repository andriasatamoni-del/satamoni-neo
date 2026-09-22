import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterPaymentMethodHandler } from "../application/commands/register-payment-method.handler";
import { RequestPaymentAdjustmentHandler } from "../application/commands/request-payment-adjustment.handler";
import { ApprovePaymentAdjustmentHandler } from "../application/commands/approve-payment-adjustment.handler";
import { RejectPaymentAdjustmentHandler } from "../application/commands/reject-payment-adjustment.handler";
import { RegisterReconciliationRecordHandler } from "../application/commands/register-reconciliation-record.handler";
import { MatchReconciliationRecordHandler } from "../application/commands/match-reconciliation-record.handler";
import { IgnoreReconciliationRecordHandler } from "../application/commands/ignore-reconciliation-record.handler";
import { AutoMatchReconciliationRecordsHandler } from "../application/commands/auto-match-reconciliation-records.handler";
import { CommitReconciliationImportHandler } from "../application/commands/commit-reconciliation-import.handler";
import { CancelReconciliationImportBatchHandler } from "../application/commands/cancel-reconciliation-import-batch.handler";
import { ListPaymentMethodsHandler } from "../application/queries/list-payment-methods.handler";
import { ListPaymentsHandler } from "../application/queries/list-payments.handler";
import { ListAdjustmentRequestsHandler } from "../application/queries/list-adjustment-requests.handler";
import { ListReconciliationRecordsHandler } from "../application/queries/list-reconciliation-records.handler";
import { ListExceptionsHandler } from "../application/queries/list-exceptions.handler";
import { GetDailyOwnerReportHandler } from "../application/queries/get-daily-owner-report.handler";
import { RegisterPaymentMethodDto } from "./dto/register-payment-method.dto";
import { RequestPaymentAdjustmentDto } from "./dto/request-payment-adjustment.dto";
import { RegisterReconciliationRecordDto } from "./dto/register-reconciliation-record.dto";
import { MatchReconciliationRecordDto } from "./dto/match-reconciliation-record.dto";
import { CommitReconciliationImportDto } from "./dto/commit-reconciliation-import.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { PermissionRegistry } from "../../../shared/permissions/permission-registry";
import { PaymentControlDomainErrorFilter } from "./filters/domain-error.filter";
import type { PaymentMethod } from "../domain/payment-method.aggregate";
import type { Payment } from "../domain/payment.aggregate";
import type { PaymentAdjustmentRequest } from "../domain/payment-adjustment-request.aggregate";
import type { ReconciliationRecord } from "../domain/reconciliation-record.aggregate";

@Controller("payment-control")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(PaymentControlDomainErrorFilter)
export class PaymentControlController {
  constructor(
    private readonly registerPaymentMethod: RegisterPaymentMethodHandler,
    private readonly requestAdjustment: RequestPaymentAdjustmentHandler,
    private readonly approveAdjustment: ApprovePaymentAdjustmentHandler,
    private readonly rejectAdjustment: RejectPaymentAdjustmentHandler,
    private readonly registerReconciliationRecord: RegisterReconciliationRecordHandler,
    private readonly matchReconciliationRecord: MatchReconciliationRecordHandler,
    private readonly ignoreReconciliationRecord: IgnoreReconciliationRecordHandler,
    private readonly autoMatchReconciliationRecords: AutoMatchReconciliationRecordsHandler,
    private readonly commitReconciliationImport: CommitReconciliationImportHandler,
    private readonly cancelReconciliationImportBatch: CancelReconciliationImportBatchHandler,
    private readonly listPaymentMethods: ListPaymentMethodsHandler,
    private readonly listPayments: ListPaymentsHandler,
    private readonly listAdjustmentRequests: ListAdjustmentRequestsHandler,
    private readonly listReconciliationRecords: ListReconciliationRecordsHandler,
    private readonly listExceptions: ListExceptionsHandler,
    private readonly getDailyOwnerReport: GetDailyOwnerReportHandler,
    private readonly permissions: PermissionRegistry
  ) {}

  @Get("payment-methods")
  @RequirePermission("payment_control.view")
  async paymentMethods() {
    return (await this.listPaymentMethods.execute()).map(toPublicPaymentMethod);
  }

  @Post("payment-methods")
  @RequirePermission("payment_control.methods.manage")
  async createPaymentMethod(@Body() dto: RegisterPaymentMethodDto) {
    return toPublicPaymentMethod(await this.registerPaymentMethod.execute(dto));
  }

  @Get("payments")
  @RequirePermission("payment_control.view")
  async payments(@Query("branchId") branchId?: string, @Query("settlementChannel") settlementChannel?: string) {
    return (await this.listPayments.execute({ branchId, settlementChannel })).map(toPublicPayment);
  }

  @Get("adjustment-requests")
  @RequirePermission("payment_control.view")
  async adjustmentRequests(@Query("paymentId") paymentId?: string, @Query("status") status?: string) {
    return (await this.listAdjustmentRequests.execute({ paymentId, status })).map(toPublicAdjustmentRequest);
  }

  @Post("adjustment-requests")
  @RequirePermission("payment_control.adjustment.request")
  async createAdjustmentRequest(@Body() dto: RequestPaymentAdjustmentDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAdjustmentRequest(await this.requestAdjustment.execute({ ...dto, requestedBy: req.user.id }));
  }

  @Post("adjustment-requests/:id/approve")
  @RequirePermission("payment_control.adjustment.approve", "payment_control.adjustment.approve_high")
  async approve(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    const hasHighApproval = this.permissions.hasPermission(req.user.role, "payment_control.adjustment.approve_high", {
      grants: req.user.permissionGrants,
      revokes: req.user.permissionRevokes,
    });
    return toPublicAdjustmentRequest(
      await this.approveAdjustment.execute({ requestId: id, decidedBy: req.user.id, hasHighApproval })
    );
  }

  @Post("adjustment-requests/:id/reject")
  @RequirePermission("payment_control.adjustment.approve", "payment_control.adjustment.approve_high")
  async reject(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAdjustmentRequest(await this.rejectAdjustment.execute({ requestId: id, decidedBy: req.user.id }));
  }

  @Get("reconciliation-records")
  @RequirePermission("payment_control.view")
  async reconciliationRecords(
    @Query("branchId") branchId?: string,
    @Query("source") source?: string,
    @Query("matchStatus") matchStatus?: string
  ) {
    return (await this.listReconciliationRecords.execute({ branchId, source, matchStatus })).map(toPublicReconciliationRecord);
  }

  @Post("reconciliation-records")
  @RequirePermission("payment_control.reconciliation.enter")
  async createReconciliationRecord(@Body() dto: RegisterReconciliationRecordDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicReconciliationRecord(
      await this.registerReconciliationRecord.execute({
        ...dto,
        externalDate: new Date(dto.externalDate),
        enteredBy: req.user.id,
      })
    );
  }

  @Patch("reconciliation-records/:id/match")
  @RequirePermission("payment_control.reconciliation.enter")
  async matchRecord(@Param("id") id: string, @Body() dto: MatchReconciliationRecordDto) {
    return toPublicReconciliationRecord(await this.matchReconciliationRecord.execute({ recordId: id, paymentId: dto.paymentId }));
  }

  @Post("reconciliation-records/:id/ignore")
  @RequirePermission("payment_control.reconciliation.enter")
  async ignoreRecord(@Param("id") id: string) {
    return toPublicReconciliationRecord(await this.ignoreReconciliationRecord.execute(id));
  }

  @Post("reconciliation-records/match-auto")
  @RequirePermission("payment_control.reconciliation.enter")
  async matchAuto() {
    return this.autoMatchReconciliationRecords.execute();
  }

  @Post("reconciliation-records/import/commit")
  @RequirePermission("payment_control.reconciliation.enter")
  async commitImport(@Body() dto: CommitReconciliationImportDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return this.commitReconciliationImport.execute({
      source: dto.source,
      branchId: dto.branchId,
      rows: dto.rows.map((r) => ({ externalDate: new Date(r.externalDate), externalAmount: r.externalAmount, externalReference: r.externalReference })),
      enteredBy: req.user.id,
    });
  }

  @Delete("reconciliation-records/import-batches/:batchId")
  @RequirePermission("payment_control.reconciliation.enter")
  async cancelImportBatch(@Param("batchId") batchId: string) {
    return this.cancelReconciliationImportBatch.execute(batchId);
  }

  @Get("exceptions")
  @RequirePermission("payment_control.view")
  async exceptions(@Query("branchId") branchId?: string) {
    return this.listExceptions.execute({ branchId });
  }

  @Get("reports/daily-owner")
  @RequirePermission("payment_control.view")
  async dailyOwnerReport(@Query("date") date: string, @Query("branchId") branchId?: string) {
    return this.getDailyOwnerReport.execute({ date, branchId });
  }
}

function toPublicPaymentMethod(method: PaymentMethod) {
  return { id: method.id, name: method.name, kind: method.kind, settlementChannel: method.settlementChannel, isActive: method.isActive };
}

function toPublicPayment(payment: Payment) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    branchId: payment.branchId,
    paymentMethodId: payment.paymentMethodId,
    methodKind: payment.methodKind,
    settlementChannel: payment.settlementChannel,
    amount: payment.amount,
    lockedAt: payment.lockedAt,
  };
}

function toPublicAdjustmentRequest(request: PaymentAdjustmentRequest) {
  return {
    id: request.id,
    paymentId: request.paymentId,
    reason: request.reason,
    proposedPaymentMethodId: request.proposedPaymentMethodId,
    proposedAmount: request.proposedAmount,
    amountDelta: request.amountDelta,
    status: request.status,
    requestedAt: request.requestedAt,
    decidedAt: request.decidedAt,
  };
}

function toPublicReconciliationRecord(record: ReconciliationRecord) {
  return {
    id: record.id,
    branchId: record.branchId,
    source: record.source,
    externalReference: record.externalReference,
    externalAmount: record.externalAmount,
    externalDate: record.externalDate,
    matchedPaymentId: record.matchedPaymentId,
    matchStatus: record.matchStatus,
    notes: record.notes,
    importBatchId: record.importBatchId,
  };
}
