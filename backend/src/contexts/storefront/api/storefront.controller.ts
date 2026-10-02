import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { GetStorefrontMenuHandler } from "../application/queries/get-storefront-menu.handler";
import { PlaceOnlineOrderHandler } from "../application/commands/place-online-order.handler";
import { TrackOnlineOrderHandler } from "../application/queries/track-online-order.handler";
import { ListMyOnlineOrdersHandler } from "../application/queries/list-my-online-orders.handler";
import { PlaceOnlineOrderDto } from "./dto/place-online-order.dto";
import { StorefrontDomainErrorFilter } from "./filters/domain-error.filter";
import { CustomerAuthGuard } from "../../customers/api/guards/customer-auth.guard";
import type { Customer } from "../../customers/domain/customer.aggregate";
import type { TrackedOrder } from "../domain/ports/storefront-reader.port";

// موقع الطلب العام (STORE-1/2) - نفس public/order.html في الريبو القديم. المنيو والتتبّع عامين (مفيش
// JwtAuthGuard بتاع الموظفين)، والطلب نفسه بحساب عميل إلزامي (CustomerAuthGuard)
@Controller("storefront")
@UseFilters(StorefrontDomainErrorFilter)
export class StorefrontController {
  constructor(
    private readonly getMenu: GetStorefrontMenuHandler,
    private readonly placeOrder: PlaceOnlineOrderHandler,
    private readonly trackOrder: TrackOnlineOrderHandler,
    private readonly listMyOrders: ListMyOnlineOrdersHandler
  ) {}

  @Get("menu")
  async menu() {
    return this.getMenu.execute();
  }

  // الحساب إلزامي للطلب (STORE-2). حد أقل من الافتراضي - endpoint بيسجّل طلبات حقيقية في المطبخ
  @Post("orders")
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: Number(process.env.THROTTLE_STOREFRONT_ORDER_LIMIT) || 10, ttl: 60_000 } })
  async place(@Body() dto: PlaceOnlineOrderDto, @Req() req: Request & { customer: Customer }) {
    return this.placeOrder.execute({ ...dto, customer: req.customer });
  }

  @Get("orders/:orderId")
  async track(@Param("orderId", ParseUUIDPipe) orderId: string, @Query("token") token?: string) {
    return toPublicTrackedOrder(await this.trackOrder.execute({ orderId, token }));
  }

  @UseGuards(CustomerAuthGuard)
  @Get("me/orders")
  async myOrders(@Req() req: Request & { customer: Customer }) {
    return (await this.listMyOrders.execute(req.customer)).map(toPublicTrackedOrder);
  }
}

function toPublicTrackedOrder(order: TrackedOrder) {
  return {
    id: order.id,
    trackingToken: order.trackingToken,
    source: order.source,
    orderType: order.orderType,
    status: order.status,
    kitchenStatus: order.kitchenStatus,
    customerName: order.customerName,
    addressDetails: order.addressDetails,
    tableNumber: order.tableNumber,
    customerNotes: order.customerNotes,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    createdAt: order.createdAt,
    kitchenAcceptedAt: order.kitchenAcceptedAt,
    kitchenReadyAt: order.kitchenReadyAt,
    branch: order.branch,
    lines: order.lines,
    rated: order.rated,
  };
}
