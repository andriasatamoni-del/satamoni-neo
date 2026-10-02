import { Injectable } from "@nestjs/common";
import { JournalEntry } from "../../domain/journal-entry.aggregate";
import type { OrderRegisteredEvent } from "../../../orders/domain/events/order-registered.event";
import { AccountingPostingService } from "../services/accounting-posting.service";

// BL-07 (approved requirement): cost of goods sold for recipe-based sales.
//   Dr 5100 COGS            (same legacy account code the old system posted sale cost to)
//   Cr 1400 Inventory asset
// Amount = the ACTUAL cost recorded on the order's CONSUMPTION stock movements (unit cost on record at the moment of sale -
// the documented "last purchase cost" method), never a theoretical recipe cost. Orders whose items have no recipe consume
// nothing and therefore post no COGS (documented rule). It is a separate journal (source "order_cogs") from the revenue entry so
// historical orders can be repaired independently; it is reversed together with the sale when the order is cancelled.
export const COGS_ACCOUNT_CODE = "5100";
export const INVENTORY_ASSET_ACCOUNT_CODE = "1400";

@Injectable()
export class PostOrderCogsJournalEntryHandler {
  constructor(private readonly posting: AccountingPostingService) {}

  async handle(event: OrderRegisteredEvent, opts?: { entryDate?: Date }): Promise<void> {
    const cost = Math.round(event.costOfGoodsSold * 100) / 100;
    if (cost <= 0) return;

    const acc = await this.posting.requireAccounts([COGS_ACCOUNT_CODE, INVENTORY_ASSET_ACCOUNT_CODE], "order_cogs", event.orderId);
    if (!acc) return;

    const entry = JournalEntry.register({
      sourceType: "order_cogs",
      sourceId: event.orderId,
      branchId: event.branchId,
      entryDate: opts?.entryDate,
      description: `تكلفة بضاعة مباعة - الطلب ${event.orderId}${event.costIncomplete ? " (تكلفة جزئية: بعض المكونات بدون تكلفة مسجّلة)" : ""}`,
      lines: [
        { accountId: acc[COGS_ACCOUNT_CODE].id, debit: cost, credit: 0 },
        { accountId: acc[INVENTORY_ASSET_ACCOUNT_CODE].id, debit: 0, credit: cost },
      ],
      createdBy: event.createdBy,
    });
    await this.posting.postOnce(entry);
  }
}
