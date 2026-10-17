import type { BranchDay } from "../branch-day.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

export interface BranchDayRepositoryPort {
  save(branchDay: BranchDay): Promise<void>;
  findByBranchAndDate(branchId: string, businessDate: string): Promise<BranchDay | null>;
  list(branchId: string, page: PageRequest): Promise<{ days: BranchDay[]; total: number }>;
}

export const BRANCH_DAY_REPOSITORY = Symbol("BRANCH_DAY_REPOSITORY");
