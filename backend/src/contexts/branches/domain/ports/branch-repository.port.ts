import type { Branch } from "../branch.aggregate";

export interface BranchRepositoryPort {
  save(branch: Branch): Promise<void>;
  findById(id: string): Promise<Branch | null>;
  findByLegacyBranchId(legacyBranchId: number): Promise<Branch | null>;
  findByTalabatBranchId(talabatBranchId: string): Promise<Branch | null>;
  list(): Promise<Branch[]>;
}

export const BRANCH_REPOSITORY = Symbol("BRANCH_REPOSITORY");
