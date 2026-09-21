import type { BranchDayRedItem, BranchDayYellowItem } from "../branch-day-checklist";

export interface BranchDayTodaySummary {
  totalSales: number;
  orderCount: number;
}

export interface BranchDayChecklistReaderPort {
  buildRedItems(branchId: string): Promise<BranchDayRedItem[]>;
  buildYellowItems(branchId: string): Promise<BranchDayYellowItem[]>;
  getSummaryForDate(branchId: string, businessDate: string): Promise<BranchDayTodaySummary>;
  getCashVarianceTotalForDate(branchId: string, businessDate: string): Promise<number>;
}

export const BRANCH_DAY_CHECKLIST_READER = Symbol("BRANCH_DAY_CHECKLIST_READER");
