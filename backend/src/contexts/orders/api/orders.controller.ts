import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterOrderHandler } from "../application/commands/register-order.handler";
import { UpdateOrderStatusHandler } from "../application/commands/update-order-status.handler";
import { AdvanceKitchenStatusHandler } from "../application/commands/advance-kitchen-status.handler";
import { ListOrdersHandler } from "../application/queries/list-orders.handler";
import { ListKdsBoardHandler } from "../application/queries/list-kds-board.handler";
import { RegisterOrderDto } from "./dto/register-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { AdvanceKitchenStatusDto } from "./dto/advance-kitchen-status.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { OrdersDomainErrorFilter } from "./filters/domain-error.filter";
import type { Order } from "../domain/order.aggregate";

@Controller("orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(OrdersDomainErrorFilter)
export class OrdersController {
  constructor(
    private readonly registerOrder: RegisterOrderHandler,
    private readonly updateOrderStatus: UpdateOrderStatusHandler,
    private readonly advanceKitchenStatus: AdvanceKitchenStatusHandler,
    private readonly listOrders: ListOrdersHandler,
    private readonly listKdsBoard: ListKdsBoardHandler
  ) {}

  @Get()
  @RequirePermission("orders.view", "orders.create")
  async list(@Query("branchId") branchId?: string) {
    return (await this.listOrders.execute(branchId ? { branchId } : undefined)).map(toPublicOrder);
  }

  @Get("kitchen-board")
  @RequirePermission("kitchen.view")
  async kitchenBoard(@Query("branchId") branchId: string | undefined, @Req() req: Request & { user: AuthenticatedUser }) {
    const effectiveBranchId = branchId || req.user.branchId;
    if (!effectiveBranchId) return [];
    return (await this.listKdsBoard.execute(effectiveBranchId)).map(toPublicOrder);
  }

  @Post()
  @RequirePermission("orders.create")
  async create(@Body() dto: RegisterOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicOrder(await this.registerOrder.execute({ ...dto, createdBy: req.user.id }));
  }

  @Patch(":id/status")
  @RequirePermission("orders.manage")
  async updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) {
    return toPublicOrder(await this.updateOrderStatus.execute({ orderId: id, ...dto }));
  }

  @Patch(":id/kitchen-status")
  @RequirePermission("kitchen.advance")
  async updateKitchenStatus(@Param("id") id: string, @Body() dto: AdvanceKitchenStatusDto) {
    return toPublicOrder(await this.advanceKitchenStatus.execute({ orderId: id, kitchenStatus: dto.kitchenStatus }));
  }
}

function toPublicOrder(order: Order) {
  return {
    id: order.id,
    branchId: order.branchId,
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.items.map((i) => ({
      menuItemId: i.menuItemId,
      variantId: i.variantId,
      comboId: i.comboId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      modifiers: i.modifiers.map((m) => ({ modifierId: m.modifierId, nameAtSale: m.nameAtSale, priceAtSale: m.priceAtSale })),
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    status: order.status,
    kitchenStatus: order.kitchenStatus,
    kitchenAcceptedAt: order.kitchenAcceptedAt,
    kitchenReadyAt: order.kitchenReadyAt,
    createdAt: order.createdAt,
    paymentMethodId: order.paymentMethodId,
  };
}
