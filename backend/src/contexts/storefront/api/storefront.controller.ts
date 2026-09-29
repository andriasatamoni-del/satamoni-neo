import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
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
import { CUSTOMER_TOKEN_SERVICE, type CustomerTokenServicePort } from "../../customers/domain/ports/customer-token.service.port";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../customers/domain/ports/customer-repository.port";
import type { Customer } from "../../customers/domain/customer.aggregate";
import type { TrackedOrder } from "../domain/ports/storefront-reader.port";

// موقع الطلب العام (STORE-1) - نفس public/order.html في الريبو القديم. عام بالكامل (مفيش JwtAuthGuard
// بتاع الموظفين)، وحساب العميل اختياري: لو فيه توكن عميل بنستخدمه، ولو مفيش الطلب بيتسجّل كضيف.
@Controller("storefront")
@UseFilters(StorefrontDomainErrorFilter)
export class StorefrontController {
  constructor(
    private readonly getMenu: GetStorefrontMenuHandler,
    private readonly placeOrder: PlaceOnlineOrderHandler,
    private readonly trackOrder: TrackOnlineOrderHandler,
    private readonly listMyOrders: ListMyOnlineOrdersHandler,
    @Inject(CUSTOMER_TOKEN_SERVICE) private readonly tokens: CustomerTokenServicePort,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort
  ) {}

  @Get("menu")
  async menu() {
    return this.getMenu.execute();
  }

  // حد أقل من الافتراضي (100/دقيقة) - endpoint عام بيسجّل طلبات حقيقية في المطبخ
  @Post("orders")
  @Throttle({ default: { limit: Number(process.env.THROTTLE_STOREFRONT_ORDER_LIMIT) || 10, ttl: 60_000 } })
  async place(@Body() dto: PlaceOnlineOrderDto, @Req() req: Request) {
    const customer = await this.optionalCustomer(req);
    return this.placeOrder.execute({ ...dto, customer });
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

  private async optionalCustomer(req: Request): Promise<Customer | null> {
    const header = req.headers.authorization;
    if (!header) return null;
    if (!header.startsWith("Bearer ")) throw new UnauthorizedException("التوكن غير صالح");
    let sub: string;
    try {
      sub = this.tokens.verify(header.slice("Bearer ".length)).sub;
    } catch {
      throw new UnauthorizedException("جلستك انتهت، سجل دخول تاني أو كمّل كضيف");
    }
    const customer = await this.customers.findById(sub);
    if (!customer || !customer.hasAccount) throw new UnauthorizedException("الحساب ده مش موجود، سجل دخول تاني");
    return customer;
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
