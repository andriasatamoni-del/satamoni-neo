import { Inject, Injectable, Logger } from "@nestjs/common";
import { JOURNAL_ENTRY_REPOSITORY, type JournalEntryRepositoryPort } from "../../domain/ports/journal-entry-repository.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { ConversionOrderCompletedEvent } from "../../../production/domain/events/conversion-order-completed.event";

// نفس فلسفة post-stocktake-variance-journal-entry.handler.ts - التصنيع بيحوّل قيمة داخل نفس حساب
// المخزون المشترك 1400 (خام → تام): مدين المنتج التام/دائن المكونات المستهلكة، وأي فرق بينهم (فرق إنتاج/
// Yield Variance حقيقي - راجع تعليق conversion-order.aggregate.ts) بيتقفل على 5300 عشان القيد يفضل
// متزن دايمًا مهما كان الفرق
const INVENTORY_ACCOUNT_CODE = "1400";
const VARIANCE_ACCOUNT_CODE = "5300";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class PostConversionOrderJournalEntryHandler {
  private readonly logger = new Logger(PostConversionOrderJournalEntryHandler.name);

  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY) private readonly entries: JournalEntryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async handle(event: ConversionOrderCompletedEvent): Promise<void> {
    const inventoryAccount = await this.accounts.findByCode(INVENTORY_ACCOUNT_CODE);
    if (!inventoryAccount) {
      this.logger.warn(`تخطّي ترحيل قيد تصنيع ${event.conversionOrderId} - دليل الحسابات لسه مش معدّ (${INVENTORY_ACCOUNT_CODE})`);
      return;
    }

    const finishedGoodsValue = round2(event.finishedGoodsValue);
    const rawMaterialValue = round2(event.rawMaterialValue);
    const varianceAmount = round2(finishedGoodsValue - rawMaterialValue);

    const lines: { accountId: string; debit: number; credit: number }[] = [];
    if (finishedGoodsValue > 0) lines.push({ accountId: inventoryAccount.id, debit: finishedGoodsValue, credit: 0 });
    if (rawMaterialValue > 0) lines.push({ accountId: inventoryAccount.id, debit: 0, credit: rawMaterialValue });

    if (Math.abs(varianceAmount) > 0.0000001) {
      const varianceAccount = await this.accounts.findByCode(VARIANCE_ACCOUNT_CODE);
      if (!varianceAccount) {
        this.logger.warn(`تخطّي ترحيل قيد تصنيع ${event.conversionOrderId} - حساب فرق الإنتاج لسه مش معدّ (${VARIANCE_ACCOUNT_CODE})`);
        return;
      }
      if (varianceAmount > 0) lines.push({ accountId: varianceAccount.id, debit: 0, credit: varianceAmount });
      else lines.push({ accountId: varianceAccount.id, debit: -varianceAmount, credit: 0 });
    }

    if (lines.length === 0) return;

    const entry = JournalEntry.register({
      sourceType: "conversion_order",
      sourceId: event.conversionOrderId,
      branchId: event.branchId,
      description: `تصنيع - أمر تحويل #${event.conversionOrderId}`,
      lines,
      createdBy: event.createdBy,
    });
    await this.entries.save(entry);
  }
}
