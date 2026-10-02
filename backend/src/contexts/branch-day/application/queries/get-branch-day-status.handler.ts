import { Inject, Injectable } from "@nestjs/common";
import { classifyChecklist } from "../../domain/branch-day-checklist";
import { BRANCH_DAY_REPOSITORY, type BranchDayRepositoryPort } from "../../domain/ports/branch-day-repository.port";
import {
  BRANCH_DAY_CHECKLIST_READER,
  type BranchDayChecklistReaderPort,
} from "../../domain/ports/branch-day-checklist-reader.port";
import { businessDateString } from "../../../../shared/time/business-date";

function todayBusinessDate(): string {
  return businessDateString();
}

@Injectable()
export class GetBranchDayStatusHandler {
  constructor(
    @Inject(BRANCH_DAY_REPOSITORY) private readonly branchDays: BranchDayRepositoryPort,
    @Inject(BRANCH_DAY_CHECKLIST_READER) private readonly checklistReader: BranchDayChecklistReaderPort
  ) {}

  async execute(branchId: string, businessDate?: string) {
    const date = businessDate || todayBusinessDate();
    const [redItems, yellowItems, existing, summary] = await Promise.all([
      this.checklistReader.buildRedItems(branchId),
      this.checklistReader.buildYellowItems(branchId),
      this.branchDays.findByBranchAndDate(branchId, date),
      this.checklistReader.getSummaryForDate(branchId, date),
    ]);
    const checklist = classifyChecklist(redItems, yellowItems);

    return {
      businessDate: date,
      alreadyClosed: existing !== null,
      dayRecord: existing,
      ...checklist,
      todaySummary: summary,
    };
  }
}
