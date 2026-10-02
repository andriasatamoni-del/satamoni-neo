import { Inject, Injectable } from "@nestjs/common";
import { INVENTORY_REPORTS_READER, type InventoryReportsReaderPort } from "../../domain/ports/inventory-reports-reader.port";
import { businessDateString } from "../../../../shared/time/business-date";

const DEFAULT_RANGE_DAYS = 30;

function resolveRange(query: { from?: string; to?: string }): { from: string; to: string } {
  const toStr = query.to ?? businessDateString();
  const fromStr = query.from ?? new Date(new Date(toStr).getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: fromStr, to: toStr };
}

@Injectable()
export class GetInventoryReportsHandler {
  constructor(@Inject(INVENTORY_REPORTS_READER) private readonly reader: InventoryReportsReaderPort) {}

  async valuation(query: { branchId: string | null }) {
    return this.reader.getValuation(query);
  }

  async stockCard(query: { branchId: string; inventoryItemId: string; from?: string; to?: string }) {
    return this.reader.getStockCard(query);
  }

  async transfers(query: { branchId: string | null; from?: string; to?: string }) {
    const { from, to } = resolveRange(query);
    return this.reader.getTransfers({ branchId: query.branchId, from, to });
  }

  async negativeStock(query: { branchId: string | null }) {
    return this.reader.getNegativeStock(query);
  }

  async inventoryComparison(query: { inventoryItemId: string | null }) {
    return this.reader.getInventoryComparison(query);
  }

  async expiringBatches(query: { days?: number; branchId: string | null }) {
    return this.reader.getExpiringBatches({ days: query.days ?? 7, branchId: query.branchId });
  }
}
