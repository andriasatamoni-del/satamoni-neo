import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ClaimPrintJobHandler } from "../application/commands/claim-print-job.handler";
import { MarkPrintJobPrintedHandler } from "../application/commands/mark-print-job-printed.handler";
import { MarkPrintJobFailedHandler } from "../application/commands/mark-print-job-failed.handler";
import { RetryPrintJobHandler } from "../application/commands/retry-print-job.handler";
import { QueueDeliveryHandoverPrintJobHandler } from "../application/commands/queue-delivery-handover-print-job.handler";
import { QueueDineinBillPrintJobHandler } from "../application/commands/queue-dinein-bill-print-job.handler";
import { ListPrintJobsHandler } from "../application/queries/list-print-jobs.handler";
import { MarkPrintJobFailedDto } from "./dto/mark-print-job-failed.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { PrintingDomainErrorFilter } from "./filters/domain-error.filter";
import type { PrintJob } from "../domain/print-job.aggregate";

function toPublicJob(job: PrintJob) {
  return {
    id: job.id, orderId: job.orderId, branchId: job.branchId, printType: job.printType,
    printerId: job.printerId, stationId: job.stationId, status: job.status,
    contentHtml: job.contentHtml, attempts: job.attempts, lastError: job.lastError,
    createdAt: job.createdAt, printingStartedAt: job.printingStartedAt, printedAt: job.printedAt, failedAt: job.failedAt,
  };
}

// الـAPI اللي وكيل الطباعة المحلي بيتعامل معاه بس (نفس فلسفة الريبو القديم: مفيش وصول مباشر لقاعدة
// البيانات من الوكيل خالص، كل حاجة عن طريق الـHTTP API ده بحساب مستخدم حقيقي عادي)
@Controller("printing/print-jobs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(PrintingDomainErrorFilter)
export class PrintJobsController {
  constructor(
    private readonly claimPrintJob: ClaimPrintJobHandler,
    private readonly markPrinted: MarkPrintJobPrintedHandler,
    private readonly markFailed: MarkPrintJobFailedHandler,
    private readonly retryPrintJob: RetryPrintJobHandler,
    private readonly queueDeliveryHandover: QueueDeliveryHandoverPrintJobHandler,
    private readonly queueDineinBill: QueueDineinBillPrintJobHandler,
    private readonly listPrintJobs: ListPrintJobsHandler
  ) {}

  @Get()
  @RequirePermission("print_jobs.view", "print_jobs.manage_queue")
  async list(
    @Query("branchId") branchId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("orderId") orderId: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const effectiveBranchId = branchId || req.user.branchId;
    if (!effectiveBranchId) return [];
    return (await this.listPrintJobs.execute({ branchId: effectiveBranchId, status, orderId, limit: limit ? Number(limit) : undefined })).map(
      toPublicJob
    );
  }

  @Post(":id/claim")
  @RequirePermission("print_jobs.manage_queue")
  async claim(@Param("id") id: string) {
    return toPublicJob(await this.claimPrintJob.execute({ printJobId: id }));
  }

  @Post(":id/printed")
  @RequirePermission("print_jobs.manage_queue")
  async printed(@Param("id") id: string) {
    return toPublicJob(await this.markPrinted.execute({ printJobId: id }));
  }

  @Post(":id/failed")
  @RequirePermission("print_jobs.manage_queue")
  async failed(@Param("id") id: string, @Body() dto: MarkPrintJobFailedDto) {
    return toPublicJob(await this.markFailed.execute({ printJobId: id, error: dto.error }));
  }

  @Post(":id/retry")
  @RequirePermission("print_jobs.manage_queue")
  async retry(@Param("id") id: string) {
    return toPublicJob(await this.retryPrintJob.execute({ printJobId: id }));
  }

  @Post("delivery-handover/:orderId")
  @RequirePermission("orders.manage")
  async deliveryHandover(@Param("orderId") orderId: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicJob(await this.queueDeliveryHandover.execute({ orderId, createdBy: req.user.id }));
  }

  @Post("dine-in-bill/:orderId")
  @RequirePermission("orders.view", "orders.create")
  async dineInBill(@Param("orderId") orderId: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicJob(await this.queueDineinBill.execute({ orderId, createdBy: req.user.id }));
  }
}
