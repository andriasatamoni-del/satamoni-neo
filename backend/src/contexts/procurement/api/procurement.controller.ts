import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterSupplierHandler } from "../application/commands/register-supplier.handler";
import { RegisterPurchaseOrderHandler } from "../application/commands/register-purchase-order.handler";
import { RegisterGoodsReceiptHandler } from "../application/commands/register-goods-receipt.handler";
import { ConfirmGoodsReceiptHandler } from "../application/commands/confirm-goods-receipt.handler";
import { RegisterSupplierInvoiceHandler } from "../application/commands/register-supplier-invoice.handler";
import { ApproveSupplierInvoiceHandler } from "../application/commands/approve-supplier-invoice.handler";
import { CancelSupplierInvoiceHandler } from "../application/commands/cancel-supplier-invoice.handler";
import { RegisterSupplierPaymentHandler } from "../application/commands/register-supplier-payment.handler";
import { RegisterPurchaseRequestHandler } from "../application/commands/register-purchase-request.handler";
import { EditPurchaseRequestHandler } from "../application/commands/edit-purchase-request.handler";
import { SubmitPurchaseRequestHandler } from "../application/commands/submit-purchase-request.handler";
import { ApprovePurchaseRequestHandler } from "../application/commands/approve-purchase-request.handler";
import { RejectPurchaseRequestHandler } from "../application/commands/reject-purchase-request.handler";
import { CancelPurchaseRequestHandler } from "../application/commands/cancel-purchase-request.handler";
import { RegisterPurchaseReturnHandler } from "../application/commands/register-purchase-return.handler";
import { PostPurchaseReturnHandler } from "../application/commands/post-purchase-return.handler";
import { CancelPurchaseReturnHandler } from "../application/commands/cancel-purchase-return.handler";
import { ListSuppliersHandler } from "../application/queries/list-suppliers.handler";
import { ListPurchaseOrdersHandler } from "../application/queries/list-purchase-orders.handler";
import { ListGoodsReceiptsHandler } from "../application/queries/list-goods-receipts.handler";
import { ListSupplierInvoicesHandler } from "../application/queries/list-supplier-invoices.handler";
import { GetSupplierInvoiceHandler } from "../application/queries/get-supplier-invoice.handler";
import { ListSupplierPaymentsHandler } from "../application/queries/list-supplier-payments.handler";
import { GetSupplierBalanceHandler } from "../application/queries/get-supplier-balance.handler";
import { ListPurchaseRequestsHandler } from "../application/queries/list-purchase-requests.handler";
import { GetPurchaseRequestHandler } from "../application/queries/get-purchase-request.handler";
import { ListPurchaseReturnsHandler } from "../application/queries/list-purchase-returns.handler";
import { GetPurchaseReturnHandler } from "../application/queries/get-purchase-return.handler";
import { RegisterSupplierDto } from "./dto/register-supplier.dto";
import { RegisterPurchaseOrderDto } from "./dto/register-purchase-order.dto";
import { RegisterGoodsReceiptDto } from "./dto/register-goods-receipt.dto";
import { RegisterSupplierInvoiceDto } from "./dto/register-supplier-invoice.dto";
import { CancelSupplierInvoiceDto } from "./dto/cancel-supplier-invoice.dto";
import { RegisterSupplierPaymentDto } from "./dto/register-supplier-payment.dto";
import { RegisterPurchaseRequestDto } from "./dto/register-purchase-request.dto";
import { EditPurchaseRequestDto } from "./dto/edit-purchase-request.dto";
import { RejectPurchaseRequestDto } from "./dto/reject-purchase-request.dto";
import { RegisterPurchaseReturnDto } from "./dto/register-purchase-return.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { ProcurementDomainErrorFilter } from "./filters/domain-error.filter";
import type { Supplier } from "../domain/supplier.aggregate";
import type { PurchaseOrder } from "../domain/purchase-order.aggregate";
import type { GoodsReceipt } from "../domain/goods-receipt.aggregate";
import type { SupplierInvoice } from "../domain/supplier-invoice.aggregate";
import type { SupplierPayment } from "../domain/supplier-payment.aggregate";
import type { PurchaseRequest } from "../domain/purchase-request.aggregate";
import type { PurchaseReturn } from "../domain/purchase-return.aggregate";

@Controller("procurement")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(ProcurementDomainErrorFilter)
export class ProcurementController {
  constructor(
    private readonly registerSupplier: RegisterSupplierHandler,
    private readonly registerPurchaseOrder: RegisterPurchaseOrderHandler,
    private readonly registerGoodsReceipt: RegisterGoodsReceiptHandler,
    private readonly confirmGoodsReceipt: ConfirmGoodsReceiptHandler,
    private readonly registerSupplierInvoice: RegisterSupplierInvoiceHandler,
    private readonly approveSupplierInvoice: ApproveSupplierInvoiceHandler,
    private readonly cancelSupplierInvoice: CancelSupplierInvoiceHandler,
    private readonly registerSupplierPayment: RegisterSupplierPaymentHandler,
    private readonly listSuppliers: ListSuppliersHandler,
    private readonly listPurchaseOrders: ListPurchaseOrdersHandler,
    private readonly listGoodsReceipts: ListGoodsReceiptsHandler,
    private readonly listSupplierInvoices: ListSupplierInvoicesHandler,
    private readonly getSupplierInvoice: GetSupplierInvoiceHandler,
    private readonly listSupplierPayments: ListSupplierPaymentsHandler,
    private readonly getSupplierBalance: GetSupplierBalanceHandler,
    private readonly registerPurchaseRequest: RegisterPurchaseRequestHandler,
    private readonly editPurchaseRequest: EditPurchaseRequestHandler,
    private readonly submitPurchaseRequest: SubmitPurchaseRequestHandler,
    private readonly approvePurchaseRequest: ApprovePurchaseRequestHandler,
    private readonly rejectPurchaseRequest: RejectPurchaseRequestHandler,
    private readonly cancelPurchaseRequest: CancelPurchaseRequestHandler,
    private readonly listPurchaseRequests: ListPurchaseRequestsHandler,
    private readonly getPurchaseRequest: GetPurchaseRequestHandler,
    private readonly registerPurchaseReturn: RegisterPurchaseReturnHandler,
    private readonly postPurchaseReturn: PostPurchaseReturnHandler,
    private readonly cancelPurchaseReturn: CancelPurchaseReturnHandler,
    private readonly listPurchaseReturns: ListPurchaseReturnsHandler,
    private readonly getPurchaseReturn: GetPurchaseReturnHandler
  ) {}

  @Get("suppliers")
  @RequirePermission("procurement.suppliers.view", "procurement.suppliers.manage")
  async suppliers() {
    return (await this.listSuppliers.execute()).map(toPublicSupplier);
  }

  @Post("suppliers")
  @RequirePermission("procurement.suppliers.manage")
  async createSupplier(@Body() dto: RegisterSupplierDto) {
    return toPublicSupplier(await this.registerSupplier.execute(dto));
  }

  @Get("purchase-orders")
  @RequirePermission("procurement.purchase_orders.view", "procurement.purchase_orders.manage")
  async purchaseOrders() {
    return (await this.listPurchaseOrders.execute()).map(toPublicPurchaseOrder);
  }

  @Post("purchase-orders")
  @RequirePermission("procurement.purchase_orders.manage")
  async createPurchaseOrder(@Body() dto: RegisterPurchaseOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchaseOrder(await this.registerPurchaseOrder.execute({ ...dto, createdBy: req.user.id }));
  }

  @Get("goods-receipts")
  @RequirePermission("procurement.goods_receipts.view", "procurement.goods_receipts.manage")
  async goodsReceipts(@Query("branchId") branchId?: string) {
    return (await this.listGoodsReceipts.execute(branchId ? { branchId } : undefined)).map(toPublicGoodsReceipt);
  }

  @Post("goods-receipts")
  @RequirePermission("procurement.goods_receipts.manage")
  async createGoodsReceipt(@Body() dto: RegisterGoodsReceiptDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicGoodsReceipt(await this.registerGoodsReceipt.execute({ ...dto, receivedBy: req.user.id }));
  }

  @Post("goods-receipts/:id/confirm")
  @RequirePermission("procurement.goods_receipts.manage")
  async confirm(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicGoodsReceipt(
      await this.confirmGoodsReceipt.execute({ goodsReceiptId: id, confirmedBy: req.user.id })
    );
  }

  @Get("supplier-invoices")
  @RequirePermission("purchasing.view")
  async supplierInvoices(@Query("supplierId") supplierId?: string, @Query("branchId") branchId?: string, @Query("status") status?: string) {
    return (await this.listSupplierInvoices.execute({ supplierId, branchId, status })).map(toPublicSupplierInvoice);
  }

  @Get("supplier-invoices/:id")
  @RequirePermission("purchasing.view")
  async supplierInvoice(@Param("id") id: string) {
    const { invoice, payments } = await this.getSupplierInvoice.execute(id);
    return { invoice: toPublicSupplierInvoice(invoice), payments: payments.map(toPublicSupplierPayment) };
  }

  @Post("supplier-invoices")
  @RequirePermission("purchasing.create")
  async createSupplierInvoice(@Body() dto: RegisterSupplierInvoiceDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const invoice = await this.registerSupplierInvoice.execute({
      ...dto,
      invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      createdBy: req.user.id,
    });
    return toPublicSupplierInvoice(invoice);
  }

  @Post("supplier-invoices/:id/approve")
  @RequirePermission("purchasing.approve")
  async approveSupplierInvoiceRoute(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicSupplierInvoice(await this.approveSupplierInvoice.execute({ supplierInvoiceId: id, approvedBy: req.user.id }));
  }

  @Post("supplier-invoices/:id/cancel")
  @RequirePermission("purchasing.cancel")
  async cancelSupplierInvoiceRoute(@Param("id") id: string, @Body() dto: CancelSupplierInvoiceDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicSupplierInvoice(
      await this.cancelSupplierInvoice.execute({ supplierInvoiceId: id, reason: dto.reason, cancelledBy: req.user.id })
    );
  }

  @Get("supplier-payments")
  @RequirePermission("purchasing.view")
  async supplierPayments(@Query("supplierId") supplierId?: string, @Query("branchId") branchId?: string) {
    return (await this.listSupplierPayments.execute({ supplierId, branchId })).map(toPublicSupplierPayment);
  }

  @Post("supplier-payments")
  @RequirePermission("purchasing.create")
  async createSupplierPayment(@Body() dto: RegisterSupplierPaymentDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const payment = await this.registerSupplierPayment.execute({
      ...dto,
      paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
      createdBy: req.user.id,
    });
    return toPublicSupplierPayment(payment);
  }

  @Get("suppliers/:id/balance")
  @RequirePermission("purchasing.view")
  async supplierBalance(@Param("id") id: string) {
    return { supplierId: id, balance: await this.getSupplierBalance.execute(id) };
  }

  @Get("purchase-requests")
  @RequirePermission("purchasing.view")
  async purchaseRequests(@Query("branchId") branchId?: string, @Query("status") status?: string) {
    return (await this.listPurchaseRequests.execute({ branchId, status })).map(toPublicPurchaseRequest);
  }

  @Get("purchase-requests/:id")
  @RequirePermission("purchasing.view")
  async purchaseRequest(@Param("id") id: string) {
    return toPublicPurchaseRequest(await this.getPurchaseRequest.execute(id));
  }

  @Post("purchase-requests")
  @RequirePermission("purchasing.create")
  async createPurchaseRequest(@Body() dto: RegisterPurchaseRequestDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const request = await this.registerPurchaseRequest.execute({
      ...dto,
      requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
      requestedBy: req.user.id,
    });
    return toPublicPurchaseRequest(request);
  }

  @Post("purchase-requests/:id/edit")
  @RequirePermission("purchasing.create")
  async editPurchaseRequestRoute(@Param("id") id: string, @Body() dto: EditPurchaseRequestDto) {
    const request = await this.editPurchaseRequest.execute({
      purchaseRequestId: id,
      requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
      reason: dto.reason,
      lines: dto.lines,
    });
    return toPublicPurchaseRequest(request);
  }

  @Post("purchase-requests/:id/submit")
  @RequirePermission("purchasing.submit")
  async submitPurchaseRequestRoute(@Param("id") id: string) {
    return toPublicPurchaseRequest(await this.submitPurchaseRequest.execute(id));
  }

  @Post("purchase-requests/:id/approve")
  @RequirePermission("purchasing.approve")
  async approvePurchaseRequestRoute(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchaseRequest(await this.approvePurchaseRequest.execute({ purchaseRequestId: id, approvedBy: req.user.id }));
  }

  @Post("purchase-requests/:id/reject")
  @RequirePermission("purchasing.approve")
  async rejectPurchaseRequestRoute(@Param("id") id: string, @Body() dto: RejectPurchaseRequestDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchaseRequest(
      await this.rejectPurchaseRequest.execute({ purchaseRequestId: id, reason: dto.reason, rejectedBy: req.user.id })
    );
  }

  @Post("purchase-requests/:id/cancel")
  @RequirePermission("purchasing.cancel")
  async cancelPurchaseRequestRoute(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchaseRequest(await this.cancelPurchaseRequest.execute({ purchaseRequestId: id, cancelledBy: req.user.id }));
  }

  @Get("purchase-returns")
  @RequirePermission("purchasing.view")
  async purchaseReturns(@Query("branchId") branchId?: string, @Query("supplierId") supplierId?: string, @Query("status") status?: string) {
    return (await this.listPurchaseReturns.execute({ branchId, supplierId, status })).map(toPublicPurchaseReturn);
  }

  @Get("purchase-returns/:id")
  @RequirePermission("purchasing.view")
  async purchaseReturn(@Param("id") id: string) {
    return toPublicPurchaseReturn(await this.getPurchaseReturn.execute(id));
  }

  @Post("purchase-returns")
  @RequirePermission("purchasing.create")
  async createPurchaseReturn(@Body() dto: RegisterPurchaseReturnDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchaseReturn(await this.registerPurchaseReturn.execute({ ...dto, createdBy: req.user.id }));
  }

  @Post("purchase-returns/:id/post")
  @RequirePermission("purchasing.create")
  async postPurchaseReturnRoute(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchaseReturn(await this.postPurchaseReturn.execute({ purchaseReturnId: id, postedBy: req.user.id }));
  }

  @Post("purchase-returns/:id/cancel")
  @RequirePermission("purchasing.cancel")
  async cancelPurchaseReturnRoute(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchaseReturn(await this.cancelPurchaseReturn.execute({ purchaseReturnId: id, cancelledBy: req.user.id }));
  }
}

function toPublicSupplier(supplier: Supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    status: supplier.status,
  };
}

function toPublicPurchaseOrder(order: PurchaseOrder) {
  return {
    id: order.id,
    supplierId: order.supplierId,
    branchId: order.branchId,
    status: order.status,
    lines: order.lines.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity, unitPrice: l.unitPrice })),
    createdAt: order.createdAt,
  };
}

function toPublicGoodsReceipt(receipt: GoodsReceipt) {
  return {
    id: receipt.id,
    purchaseOrderId: receipt.purchaseOrderId,
    supplierId: receipt.supplierId,
    branchId: receipt.branchId,
    status: receipt.status,
    lines: receipt.lines.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity, unitCost: l.unitCost })),
    createdAt: receipt.createdAt,
    confirmedAt: receipt.confirmedAt,
  };
}

function toPublicSupplierInvoice(invoice: SupplierInvoice) {
  return {
    id: invoice.id,
    supplierId: invoice.supplierId,
    branchId: invoice.branchId,
    goodsReceiptId: invoice.goodsReceiptId,
    supplierInvoiceNumber: invoice.supplierInvoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    lines: invoice.lines.map((l) => ({ inventoryItemId: l.inventoryItemId, invoicedQuantity: l.invoicedQuantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    matchedTotal: invoice.matchedTotal,
    varianceAmount: invoice.varianceAmount,
    status: invoice.status,
    notes: invoice.notes,
    approvedAt: invoice.approvedAt,
    cancelledAt: invoice.cancelledAt,
    cancellationReason: invoice.cancellationReason,
    createdAt: invoice.createdAt,
  };
}

function toPublicSupplierPayment(payment: SupplierPayment) {
  return {
    id: payment.id,
    supplierId: payment.supplierId,
    branchId: payment.branchId,
    supplierInvoiceId: payment.supplierInvoiceId,
    treasuryId: payment.treasuryId,
    amount: payment.amount,
    paymentDate: payment.paymentDate,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    journalEntryId: payment.journalEntryId,
    createdAt: payment.createdAt,
  };
}

function toPublicPurchaseRequest(request: PurchaseRequest) {
  return {
    id: request.id,
    branchId: request.branchId,
    requestedBy: request.requestedBy,
    requiredDate: request.requiredDate,
    reason: request.reason,
    lines: request.lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      requestedQuantity: l.requestedQuantity,
      unit: l.unit,
      notes: l.notes,
    })),
    status: request.status,
    approvedBy: request.approvedBy,
    approvedAt: request.approvedAt,
    rejectedBy: request.rejectedBy,
    rejectionReason: request.rejectionReason,
    cancelledBy: request.cancelledBy,
    cancelledAt: request.cancelledAt,
    convertedToPurchaseOrderId: request.convertedToPurchaseOrderId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function toPublicPurchaseReturn(purchaseReturn: PurchaseReturn) {
  return {
    id: purchaseReturn.id,
    branchId: purchaseReturn.branchId,
    supplierId: purchaseReturn.supplierId,
    goodsReceiptId: purchaseReturn.goodsReceiptId,
    reason: purchaseReturn.reason,
    notes: purchaseReturn.notes,
    lines: purchaseReturn.lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      quantity: l.quantity,
      unit: l.unit,
      unitCost: l.unitCost,
      lineValue: l.lineValue,
    })),
    totalValue: purchaseReturn.totalValue,
    status: purchaseReturn.status,
    journalEntryId: purchaseReturn.journalEntryId,
    createdBy: purchaseReturn.createdBy,
    createdAt: purchaseReturn.createdAt,
    postedBy: purchaseReturn.postedBy,
    postedAt: purchaseReturn.postedAt,
    cancelledBy: purchaseReturn.cancelledBy,
    cancelledAt: purchaseReturn.cancelledAt,
  };
}
