import { Inject, Injectable } from "@nestjs/common";
import {
  DASHBOARD_SUMMARY_READER,
  type DashboardSummary,
  type DashboardSummaryReaderPort,
} from "../../domain/ports/dashboard-summary-reader.port";
import { businessDayEndUtc, businessDayStartUtc, businessRangeTs } from "../../../../shared/time/business-date";

const DEFAULT_RANGE_DAYS = 30;

export interface GetDashboardSummaryQuery {
  branchId: string | null;
  from?: string;
  to?: string;
}

@Injectable()
export class GetDashboardSummaryHandler {
  constructor(@Inject(DASHBOARD_SUMMARY_READER) private readonly reader: DashboardSummaryReaderPort) {}

  async execute(query: GetDashboardSummaryQuery): Promise<DashboardSummary> {
    const { fromTs, toTs } = businessRangeTs(query.from, query.to, DEFAULT_RANGE_DAYS);

    return this.reader.getSummary({ branchId: query.branchId, fromTs, toTs });
  }
}
