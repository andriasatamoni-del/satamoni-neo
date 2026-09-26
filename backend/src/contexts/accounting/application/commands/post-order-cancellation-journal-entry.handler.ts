import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import type { OrderCancelledEvent } from "../../../orders/domain/events/order-cancelled.event";

// بيعكس قيد البيع التلقائي (PostOrderSaleJournalEntryHandler) لما الطلب يتلغي - نفس فلسفة
// JournalEntry.reverse() الموجودة بالفعل بالظبط (نفس آلية عكس القيد اليدوي، مش منطق جديد): القيد
// الأصلي بيتعلّم إنه اترجع منه قيد عكسي (status=REVERSED)، وقيد جديد POSTED بمقلوب مدين/دائن بيتسجّل -
// القيد الأصلي مايتلمسش خالص (نفس فلسفة "أبدًا تعديل قيد POSTED").
@Injectable()
export class PostOrderCancellationJournalEntryHandler {
  private readonly logger = new Logger(PostOrderCancellationJournalEntryHandler.name);

  constructor(@Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort) {}

  async handle(event: OrderCancelledEvent): Promise<void> {
    const saleEntries = await this.entries.list({ sourceType: "order_sale" });
    const original = saleEntries.find((e) => e.sourceId === event.orderId);
    if (!original) {
      this.logger.warn(`تخطّي عكس قيد إلغاء للطلب ${event.orderId} - مفيش قيد بيع أصلي متسجّل ليه`);
      return;
    }
    if (original.status !== "POSTED") return;

    const reversal = original.reverse({ reversedBy: event.cancelledBy, reason: `إلغاء الطلب ${event.orderId}` });
    await this.entries.markReversed(original.id, original.reversedAt!);
    await this.entries.save(reversal);
  }
}
