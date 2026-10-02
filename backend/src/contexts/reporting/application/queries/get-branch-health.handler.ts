import { Inject, Injectable } from "@nestjs/common";
import {
  BRANCH_HEALTH_READER,
  type BranchHealthReaderPort,
  type BranchHealthReport,
} from "../../domain/ports/branch-health-reader.port";
import { businessDayEndUtc, businessDayStartUtc, businessRangeTs } from "../../../../shared/time/business-date";

const DEFAULT_RANGE_DAYS = 30;

export interface GetBranchHealthQuery {
  from?: string;
  to?: string;
}

@Injectable()
export class GetBranchHealthHandler {
  constructor(@Inject(BRANCH_HEALTH_READER) private readonly reader: BranchHealthReaderPort) {}

  async execute(query: GetBranchHealthQuery): Promise<BranchHealthReport> {
    const { fromTs, toTs } = businessRangeTs(query.from, query.to, DEFAULT_RANGE_DAYS);
    return this.reader.getBranchHealth({ fromTs, toTs });
  }
}
