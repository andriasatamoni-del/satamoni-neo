import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Branch } from "../../domain/branch.aggregate";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../domain/ports/branch-repository.port";

@Injectable()
export class ListBranchesHandler {
  constructor(@Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort) {}

  async execute(page?: PageRequest): Promise<{ rows: Branch[]; total: number }> {
    return this.branches.listPage(page);
  }
}
