import type { User } from "../user.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Role } from "../role";

// NEO-6: filters of the users list. `branchId: null` = users without a branch; undefined = every branch.
export interface UserListFilter {
  branchId?: string | null;
  q?: string;
  role?: Role;
  status?: "active" | "inactive";
  sort?: string;
  order?: "asc" | "desc";
}

export interface UserRepositoryPort {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByLegacyUserId(legacyUserId: number): Promise<User | null>;
  existsByEmail(email: string): Promise<boolean>;
  list(filter?: { branchId?: string | null }): Promise<User[]>;
  search(filter: UserListFilter, page?: PageRequest): Promise<{ users: User[]; total: number }>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
