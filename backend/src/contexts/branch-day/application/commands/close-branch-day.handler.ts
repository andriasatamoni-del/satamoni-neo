import { Inject, Injectable } from "@nestjs/common";
import { BranchDay } from "../../domain/branch-day.aggregate";
import { classifyChecklist } from "../../domain/branch-day-checklist";
import { BranchDayNotClosableError } from "../../domain/errors";
import { BRANCH_DAY_REPOSITORY, type BranchDayRepositoryPort } from "../../domain/ports/branch-day-repository.port";
import {
  BRANCH_DAY_CHECKLIST_READER,
  type BranchDayChecklistReaderPort,
} from "../../domain/ports/branch-day-checklist-reader.port";

function todayBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CloseBranchDayInput {
  branchId: string;
  closedBy: string;
  businessDate?: string;
  managerNotes?: string | null;
}

@Injectable()
export class CloseBranchDayHandler {
  constructor(
    @Inject(BRANCH_DAY_REPOSITORY) private readonly branchDays: BranchDayRepositoryPort,
    @Inject(BRANCH_DAY_CHECKLIST_READER) private readonly checklistReader: BranchDayChecklistReaderPort
  ) {}

  async execute(input: CloseBranchDayInput): Promise<BranchDay> {
    const businessDate = input.businessDate || todayBusinessDate();

    // نفس فلسفة الريبو القديم: نعيد فحص الـchecklist هنا مباشرة قبل الإدراج (مش قفل صفوف SQL -
    // مفيش استخدام لـtransactions صريحة في الـpattern المتبع هنا)، وUNIQUE(branch_id, business_date)
    // في الـmigration هي الحماية الحقيقية ضد قفل مزدوج متزامن (راجع KyselyBranchDayRepository.save)
    const [redItems, yellowItems, summary, cashVarianceTotal] = await Promise.all([
      this.checklistReader.buildRedItems(input.branchId),
      this.checklistReader.buildYellowItems(input.branchId),
      this.checklistReader.getSummaryForDate(input.branchId, businessDate),
      this.checklistReader.getCashVarianceTotalForDate(input.branchId, businessDate),
    ]);
    const checklist = classifyChecklist(redItems, yellowItems);
    if (!checklist.canClose) {
      throw new BranchDayNotClosableError(redItems);
    }

    const branchDay = BranchDay.register({
      branchId: input.branchId,
      businessDate,
      closedBy: input.closedBy,
      totalSales: summary.totalSales,
      orderCount: summary.orderCount,
      cashVarianceTotal,
      managerNotes: input.managerNotes,
    });

    await this.branchDays.save(branchDay);
    return branchDay;
  }
}
