import { Inject, Injectable } from "@nestjs/common";
import { Branch } from "../../domain/branch.aggregate";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../domain/ports/branch-repository.port";

@Injectable()
export class ListBranchesHandler {
  constructor(@Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort) {}

  async execute(): Promise<Branch[]> {
    return this.branches.list();
  }
}
