import { Inject, Injectable } from "@nestjs/common";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../../orders/domain/ports/order-repository.port";
import { CUSTOMER_REPOSITORY, type CustomerRepositoryPort } from "../../../customers/domain/ports/customer-repository.port";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import type { OrderStatusChangedEvent } from "../../../orders/domain/events/order-status-changed.event";
import { LOYALTY_LEDGER, type LoyaltyLedgerPort } from "../../domain/ports/loyalty-ledger.port";
import { pointsEarnedFor } from "../../domain/loyalty-rules";

// الكسب بعد ما الطلب يتقفل completed (اتسلّم فعلًا) - مش وقت التسجيل، عشان طلب اتلغى مايكسّبش. أي مصدر
// (موقع/كاشير/واتساب) طالما رقم الطلب هو رقم حساب عميل مسجّل - بيشجع العميل يعمل حساب
@Injectable()
export class AwardPointsForCompletedOrderHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepositoryPort,
    @Inject(LOYALTY_LEDGER) private readonly ledger: LoyaltyLedgerPort,
    private readonly settings: GetPosSettingsHandler
  ) {}

  async handle(event: OrderStatusChangedEvent): Promise<void> {
    if (event.status !== "completed") return;
    const order = await this.orders.findById(event.orderId);
    if (!order?.customerPhone) return;
    const customer = await this.customers.findByPhone(order.customerPhone);
    if (!customer?.hasAccount) return;
    const points = pointsEarnedFor(order.total, (await this.settings.execute()).loyaltyPointsPerEgp);
    if (points > 0) await this.ledger.earnForOrder(customer.id, order.id, points);
  }
}
