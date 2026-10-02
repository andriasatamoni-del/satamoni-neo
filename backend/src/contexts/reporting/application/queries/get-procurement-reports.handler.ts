import { Inject, Injectable } from "@nestjs/common";
import { PROCUREMENT_REPORTS_READER, type ProcurementReportsReaderPort } from "../../domain/ports/procurement-reports-reader.port";
import { businessDateString } from "../../../../shared/time/business-date";

const DEFAULT_RANGE_DAYS = 30;

function resolveRange(query: { from?: string; to?: string }): { from: string; to: string } {
  const toStr = query.to ?? businessDateString();
  const fromStr = query.from ?? new Date(new Date(toStr).getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: fromStr, to: toStr };
}

@Injectable()
export class GetProcurementReportsHandler {
  constructor(@Inject(PROCUREMENT_REPORTS_READER) private readonly reader: ProcurementReportsReaderPort) {}

  async purchaseOrders(query: { branchId: string | null; supplierId?: string; status?: string; from?: string; to?: string }) {
    const { from, to } = resolveRange(query);
    return this.reader.getPurchaseOrders({ ...query, from, to });
  }

  async purchaseReceipts(query: { branchId: string | null; supplierId?: string; from?: string; to?: string }) {
    const { from, to } = resolveRange(query);
    return this.reader.getPurchaseReceipts({ ...query, from, to });
  }

  async purchasePriceHistory(query: { inventoryItemId: string; supplierId?: string }) {
    return this.reader.getPurchasePriceHistory(query);
  }

  async purchasePriceVariance(query: { branchId: string | null; from?: string; to?: string }) {
    const { from, to } = resolveRange(query);
    return this.reader.getPurchasePriceVariance({ branchId: query.branchId, from, to });
  }

  async supplierPerformance(query: { supplierId: string; from?: string; to?: string }) {
    const { from, to } = resolveRange(query);
    return this.reader.getSupplierPerformance({ supplierId: query.supplierId, from, to });
  }

  async outstandingPurchaseOrders(query: { branchId: string | null }) {
    return this.reader.getOutstandingPurchaseOrders(query);
  }
}
