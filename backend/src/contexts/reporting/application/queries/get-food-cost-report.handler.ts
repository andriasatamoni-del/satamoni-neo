import { Inject, Injectable } from "@nestjs/common";
import {
  FOOD_COST_READER,
  type FoodCostReaderPort,
  type FoodCostReport,
  type FoodCostByBranchReport,
} from "../../domain/ports/food-cost-reader.port";

const DEFAULT_RANGE_DAYS = 30;

export interface GetFoodCostReportQuery {
  branchId: string | null;
  from?: string;
  to?: string;
}

function resolveRange(query: { from?: string; to?: string }): { fromTs: Date; toTs: Date } {
  const toTs = query.to ? new Date(`${query.to}T23:59:59.999`) : new Date();
  const fromTs = query.from
    ? new Date(`${query.from}T00:00:00.000`)
    : new Date(toTs.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
  return { fromTs, toTs };
}

@Injectable()
export class GetFoodCostReportHandler {
  constructor(@Inject(FOOD_COST_READER) private readonly reader: FoodCostReaderPort) {}

  async execute(query: GetFoodCostReportQuery): Promise<FoodCostReport> {
    const { fromTs, toTs } = resolveRange(query);
    return this.reader.getVariance({ branchId: query.branchId, fromTs, toTs });
  }

  async executeByBranch(query: { from?: string; to?: string }): Promise<FoodCostByBranchReport> {
    const { fromTs, toTs } = resolveRange(query);
    return this.reader.getByBranch({ fromTs, toTs });
  }
}
