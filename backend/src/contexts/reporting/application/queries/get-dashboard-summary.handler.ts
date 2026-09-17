import { Inject, Injectable } from "@nestjs/common";
import {
  DASHBOARD_SUMMARY_READER,
  type DashboardSummary,
  type DashboardSummaryReaderPort,
} from "../../domain/ports/dashboard-summary-reader.port";

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
    const toTs = query.to ? new Date(`${query.to}T23:59:59.999`) : new Date();
    const fromTs = query.from
      ? new Date(`${query.from}T00:00:00.000`)
      : new Date(toTs.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);

    return this.reader.getSummary({ branchId: query.branchId, fromTs, toTs });
  }
}
