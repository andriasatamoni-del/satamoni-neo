import { Inject, Injectable } from "@nestjs/common";
import { SALES_OPS_READER, type SalesOpsReaderPort } from "../../domain/ports/sales-ops-reader.port";
import { businessDateString } from "../../../../shared/time/business-date";

const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_DELAY_THRESHOLD_MINUTES = 45;
const DEFAULT_ITEM_PERFORMANCE_LIMIT = 15;

function resolveRange(query: { from?: string; to?: string }): { from: string; to: string } {
  const toStr = query.to ?? businessDateString();
  const fromStr = query.from ?? new Date(new Date(toStr).getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: fromStr, to: toStr };
}

export interface SalesOpsQuery {
  branchId: string | null;
  from?: string;
  to?: string;
}

@Injectable()
export class GetSalesOpsReportsHandler {
  constructor(@Inject(SALES_OPS_READER) private readonly reader: SalesOpsReaderPort) {}

  async daily(query: SalesOpsQuery) {
    const { from, to } = resolveRange(query);
    return this.reader.getDailySummary({ branchId: query.branchId, from, to });
  }

  async salesDetail(query: SalesOpsQuery) {
    const { from, to } = resolveRange(query);
    return this.reader.getSalesDetail({ branchId: query.branchId, from, to });
  }

  async cancelledOrders(query: SalesOpsQuery) {
    const { from, to } = resolveRange(query);
    return this.reader.getCancelledOrders({ branchId: query.branchId, from, to });
  }

  async delays(query: SalesOpsQuery & { thresholdMinutes?: number }) {
    const { from, to } = resolveRange(query);
    return this.reader.getDelays({
      branchId: query.branchId,
      from,
      to,
      thresholdMinutes: query.thresholdMinutes ?? DEFAULT_DELAY_THRESHOLD_MINUTES,
    });
  }

  async itemPerformance(query: SalesOpsQuery & { limit?: number }) {
    const { from, to } = resolveRange(query);
    return this.reader.getItemPerformance({ branchId: query.branchId, from, to, limit: query.limit ?? DEFAULT_ITEM_PERFORMANCE_LIMIT });
  }

  async catalog(query: SalesOpsQuery) {
    const { from, to } = resolveRange(query);
    return this.reader.getCatalogReport({ branchId: query.branchId, from, to });
  }

  async recipes() {
    return this.reader.getRecipesReport();
  }
}
