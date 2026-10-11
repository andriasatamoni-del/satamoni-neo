import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { OrderCancelledEvent } from "../../../orders/domain/events/order-cancelled.event";
import { paymentAdjustmentRequests, payments } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import { AccountingPostingService } from "../services/accounting-posting.service";

// بيعكس قيد البيع + قيد التكلفة (COGS) التلقائيين لما الطلب يتلغي - نفس آلية JournalEntry.reverse() بالظبط: القيد الأصلي
// بيتعلّم REVERSED وقيد جديد بمقلوب مدين/دائن بيتسجّل، الأصلي مايتلمسش. Phase 3.1: بيدور على القيد بالـsource (مفهرس) بدل
// ما يحمّل كل قيود البيع، وبيعكس الاتنين (بيع + تكلفة). عكس نفس القيد مرتين مستحيل: اتنين concurrent cancels بيتسلسلوا على
// row lock الطلب، وفيه unique index على reversal_of_entry_id كخط دفاع تاني على مستوى القاعدة.
@Injectable()
export class PostOrderCancellationJournalEntryHandler {
  private readonly logger = new Logger(PostOrderCancellationJournalEntryHandler.name);

  constructor(
    private readonly posting: AccountingPostingService,
    @Inject(DATABASE) private readonly db: Database
  ) {}

  async handle(event: OrderCancelledEvent): Promise<void> {
    const reason = `إلغاء الطلب ${event.orderId}`;
    const sale = await this.posting.reverseBySource("order_sale", event.orderId, event.cancelledBy, reason);
    const cogs = await this.posting.reverseBySource("order_cogs", event.orderId, event.cancelledBy, reason);

    // BL-06/BL-07: cash corrections posted for approved payment adjustments of this order are reversed together with the sale,
    // otherwise cash would stay misstated by the corrections after the sale itself was reversed.
    const adjustments = await this.db
      .select({ id: paymentAdjustmentRequests.id })
      .from(paymentAdjustmentRequests)
      .innerJoin(payments, eq(payments.id, paymentAdjustmentRequests.payment_id))
      .where(and(eq(payments.order_id, event.orderId), eq(paymentAdjustmentRequests.status, "APPROVED")));
    for (const row of adjustments) {
      await this.posting.reverseBySource("payment_adjustment", row.id, event.cancelledBy, reason);
    }
    if (sale === "nothing_to_reverse" && cogs === "nothing_to_reverse") {
      this.logger.warn(`cancellation of order ${event.orderId}: no posted sale/COGS journal to reverse (never posted - see journal coverage report)`);
    }
  }
}
