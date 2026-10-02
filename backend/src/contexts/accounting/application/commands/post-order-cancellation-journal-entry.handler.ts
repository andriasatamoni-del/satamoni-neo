import { Inject, Injectable, Logger } from "@nestjs/common";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/kysely.token";
import type { OrderCancelledEvent } from "../../../orders/domain/events/order-cancelled.event";
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
    @Inject(KYSELY) private readonly db: Kysely<Database>
  ) {}

  async handle(event: OrderCancelledEvent): Promise<void> {
    const reason = `إلغاء الطلب ${event.orderId}`;
    const sale = await this.posting.reverseBySource("order_sale", event.orderId, event.cancelledBy, reason);
    const cogs = await this.posting.reverseBySource("order_cogs", event.orderId, event.cancelledBy, reason);

    // BL-06/BL-07: cash corrections posted for approved payment adjustments of this order are reversed together with the sale,
    // otherwise cash would stay misstated by the corrections after the sale itself was reversed.
    const adjustments = await sql<{ id: string }>`
      SELECT par.id FROM payment_adjustment_requests par
        JOIN payments p ON p.id = par.payment_id
       WHERE p.order_id = ${event.orderId} AND par.status = 'APPROVED'`.execute(this.db);
    for (const row of adjustments.rows) {
      await this.posting.reverseBySource("payment_adjustment", row.id, event.cancelledBy, reason);
    }
    if (sale === "nothing_to_reverse" && cogs === "nothing_to_reverse") {
      this.logger.warn(`cancellation of order ${event.orderId}: no posted sale/COGS journal to reverse (never posted - see journal coverage report)`);
    }
  }
}
