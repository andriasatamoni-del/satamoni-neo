import { Inject, Injectable } from "@nestjs/common";
import type { BranchDay } from "../../domain/branch-day.aggregate";
import { BRANCH_DAY_REPOSITORY, type BranchDayRepositoryPort } from "../../domain/ports/branch-day-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListBranchDayHistoryHandler {
  constructor(@Inject(BRANCH_DAY_REPOSITORY) private readonly branchDays: BranchDayRepositoryPort) {}

  async execute(branchId: string, page: PageRequest): Promise<{ days: BranchDay[]; total: number }> {
    return this.branchDays.list(branchId, page);
  }
}
