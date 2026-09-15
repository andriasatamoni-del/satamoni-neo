import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterSupplierHandler } from "../application/commands/register-supplier.handler";
import { RegisterPurchaseOrderHandler } from "../application/commands/register-purchase-order.handler";
import { RegisterGoodsReceiptHandler } from "../application/commands/register-goods-receipt.handler";
import { ConfirmGoodsReceiptHandler } from "../application/commands/confirm-goods-receipt.handler";
import { ListSuppliersHandler } from "../application/queries/list-suppliers.handler";
import { ListPurchaseOrdersHandler } from "../application/queries/list-purchase-orders.handler";
import { ListGoodsReceiptsHandler } from "../application/queries/list-goods-receipts.handler";
import { RegisterSupplierDto } from "./dto/register-supplier.dto";
import { RegisterPurchaseOrderDto } from "./dto/register-purchase-order.dto";
import { RegisterGoodsReceiptDto } from "./dto/register-goods-receipt.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { ProcurementDomainErrorFilter } from "./filters/domain-error.filter";
import type { Supplier } from "../domain/supplier.aggregate";
import type { PurchaseOrder } from "../domain/purchase-order.aggregate";
import type { GoodsReceipt } from "../domain/goods-receipt.aggregate";

@Controller("procurement")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(ProcurementDomainErrorFilter)
export class ProcurementController {
  constructor(
    private readonly registerSupplier: RegisterSupplierHandler,
    private readonly registerPurchaseOrder: RegisterPurchaseOrderHandler,
    private readonly registerGoodsReceipt: RegisterGoodsReceiptHandler,
    private readonly confirmGoodsReceipt: ConfirmGoodsReceiptHandler,
    private readonly listSuppliers: ListSuppliersHandler,
    private readonly listPurchaseOrders: ListPurchaseOrdersHandler,
    private readonly listGoodsReceipts: ListGoodsReceiptsHandler
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
