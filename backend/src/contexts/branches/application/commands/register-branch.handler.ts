import { Inject, Injectable } from "@nestjs/common";
import { Branch } from "../../domain/branch.aggregate";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../domain/ports/branch-repository.port";

export interface RegisterBranchCommand {
  name: string;
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
  lat?: number | null;
  lng?: number | null;
  isCentralKitchen?: boolean;
  supportsDineIn?: boolean;
}

@Injectable()
export class RegisterBranchHandler {
  constructor(@Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort) {}

  async execute(command: RegisterBranchCommand): Promise<Branch> {
    const branch = Branch.register(command);
    await this.branches.save(branch);
    return branch;
  }
}
