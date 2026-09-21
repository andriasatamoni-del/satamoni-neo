import type { BranchDay } from "../branch-day.aggregate";

export interface BranchDayRepositoryPort {
  save(branchDay: BranchDay): Promise<void>;
  findByBranchAndDate(branchId: string, businessDate: string): Promise<BranchDay | null>;
  list(branchId: string): Promise<BranchDay[]>;
}

export const BRANCH_DAY_REPOSITORY = Symbol("BRANCH_DAY_REPOSITORY");
