import { Inject, Injectable } from "@nestjs/common";
import { Branch } from "../../domain/branch.aggregate";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../domain/ports/branch-repository.port";
import { BranchNotFoundError } from "../../domain/errors";

export interface UpdateBranchCommand {
  branchId: string;
  name?: string;
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
  talabatBranchId?: string | null;
}

@Injectable()
export class UpdateBranchHandler {
  constructor(@Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort) {}

  async execute(command: UpdateBranchCommand): Promise<Branch> {
    const branch = await this.branches.findById(command.branchId);
    if (!branch) throw new BranchNotFoundError();

    if (command.name !== undefined) branch.rename(command.name);
    branch.updateDetails({ address: command.address, phone: command.phone, hours: command.hours });
    if (command.talabatBranchId !== undefined) branch.linkTalabatBranch(command.talabatBranchId);

    await this.branches.save(branch);
    return branch;
  }
}
