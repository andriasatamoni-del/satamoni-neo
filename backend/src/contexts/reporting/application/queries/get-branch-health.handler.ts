import { Inject, Injectable } from "@nestjs/common";
import {
  BRANCH_HEALTH_READER,
  type BranchHealthReaderPort,
  type BranchHealthReport,
} from "../../domain/ports/branch-health-reader.port";

const DEFAULT_RANGE_DAYS = 30;

export interface GetBranchHealthQuery {
  from?: string;
  to?: string;
}

@Injectable()
export class GetBranchHealthHandler {
  constructor(@Inject(BRANCH_HEALTH_READER) private readonly reader: BranchHealthReaderPort) {}

  async execute(query: GetBranchHealthQuery): Promise<BranchHealthReport> {
    const toTs = query.to ? new Date(`${query.to}T23:59:59.999`) : new Date();
    const fromTs = query.from
      ? new Date(`${query.from}T00:00:00.000`)
      : new Date(toTs.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
    return this.reader.getBranchHealth({ fromTs, toTs });
  }
}
