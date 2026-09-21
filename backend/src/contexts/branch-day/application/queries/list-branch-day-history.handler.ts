import { Inject, Injectable } from "@nestjs/common";
import type { BranchDay } from "../../domain/branch-day.aggregate";
import { BRANCH_DAY_REPOSITORY, type BranchDayRepositoryPort } from "../../domain/ports/branch-day-repository.port";

@Injectable()
export class ListBranchDayHistoryHandler {
  constructor(@Inject(BRANCH_DAY_REPOSITORY) private readonly branchDays: BranchDayRepositoryPort) {}

  async execute(branchId: string): Promise<BranchDay[]> {
    return this.branchDays.list(branchId);
  }
}
