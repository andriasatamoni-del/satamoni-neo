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
import { ListSuppliersHandler } from "../application/queries/list-suppliers.handler";
import { ListPurchaseOrdersHandler } from "../application/queries/list-purchase-orders.handler";
import { ListGoodsReceiptsHandler } from "../application/queries/list-goods-receipts.handler";
import { ListSupplierInvoicesHandler } from "../application/queries/list-supplier-invoices.handler";
import { GetSupplierInvoiceHandler } from "../application/queries/get-supplier-invoice.handler";
import { ListSupplierPaymentsHandler } from "../application/queries/list-supplier-payments.handler";
import { GetSupplierBalanceHandler } from "../application/queries/get-supplier-balance.handler";
import { RegisterSupplierDto } from "./dto/register-supplier.dto";
import { RegisterPurchaseOrderDto } from "./dto/register-purchase-order.dto";
import { RegisterGoodsReceiptDto } from "./dto/register-goods-receipt.dto";
import { RegisterSupplierInvoiceDto } from "./dto/register-supplier-invoice.dto";
import { CancelSupplierInvoiceDto } from "./dto/cancel-supplier-invoice.dto";
import { RegisterSupplierPaymentDto } from "./dto/register-supplier-payment.dto";
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
    private readonly getSupplierBalance: GetSupplierBalanceHandler
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
