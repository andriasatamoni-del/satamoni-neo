import { Inject, Injectable } from "@nestjs/common";
import {
  DELIVERY_CUSTOMER_REPORTS_READER,
  type DeliveryCustomerReportsReaderPort,
} from "../../domain/ports/delivery-customer-reports-reader.port";

const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_THRESHOLD_MINUTES = 45;
const DEFAULT_CUSTOMER_LIMIT = 20;

function resolveRange(query: { from?: string; to?: string }): { from: string; to: string } {
  const toStr = query.to ?? new Date().toISOString().slice(0, 10);
  const fromStr = query.from ?? new Date(new Date(toStr).getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: fromStr, to: toStr };
}

@Injectable()
export class GetDeliveryCustomerReportsHandler {
  constructor(@Inject(DELIVERY_CUSTOMER_REPORTS_READER) private readonly reader: DeliveryCustomerReportsReaderPort) {}

  async drivers(query: { branchId: string | null; from?: string; to?: string }) {
    const { from, to } = resolveRange(query);
    return this.reader.getDrivers({ branchId: query.branchId, from, to });
  }

  async deliveryService(query: { branchId: string | null; from?: string; to?: string; thresholdMinutes?: number }) {
    const { from, to } = resolveRange(query);
    return this.reader.getDeliveryService({
      branchId: query.branchId, from, to,
      thresholdMinutes: query.thresholdMinutes ?? DEFAULT_THRESHOLD_MINUTES,
    });
  }

  async peakHours(query: { branchId: string | null; from?: string; to?: string }) {
    const { from, to } = resolveRange(query);
    return this.reader.getPeakHours({ branchId: query.branchId, from, to });
  }

  async customerSpend(query: { branchId: string | null; from?: string; to?: string; limit?: number }) {
    const { from, to } = resolveRange(query);
    return this.reader.getCustomerSpend({ branchId: query.branchId, from, to, limit: query.limit ?? DEFAULT_CUSTOMER_LIMIT });
  }

  async expensesReport(query: { branchId: string | null; from?: string; to?: string; groupBy?: "day" | "month" }) {
    const { from, to } = resolveRange(query);
    return this.reader.getExpensesReport({ branchId: query.branchId, from, to, groupBy: query.groupBy ?? "day" });
  }

  async purchasesReport(query: { branchId: string | null; from?: string; to?: string; groupBy?: "day" | "month" }) {
    const { from, to } = resolveRange(query);
    return this.reader.getPurchasesReport({ branchId: query.branchId, from, to, groupBy: query.groupBy ?? "day" });
  }
}
