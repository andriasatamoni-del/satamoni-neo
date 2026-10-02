import { Inject, Injectable } from "@nestjs/common";
import {
  FOOD_COST_READER,
  type FoodCostReaderPort,
  type FoodCostReport,
  type FoodCostByBranchReport,
} from "../../domain/ports/food-cost-reader.port";
import { businessDayEndUtc, businessDayStartUtc, businessRangeTs } from "../../../../shared/time/business-date";

const DEFAULT_RANGE_DAYS = 30;

export interface GetFoodCostReportQuery {
  branchId: string | null;
  from?: string;
  to?: string;
}

function resolveRange(query: { from?: string; to?: string }): { fromTs: Date; toTs: Date } {
  const { fromTs, toTs } = businessRangeTs(query.from, query.to, DEFAULT_RANGE_DAYS);
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
