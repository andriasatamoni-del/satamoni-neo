import type { User } from "../user.aggregate";

export interface UserRepositoryPort {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByLegacyUserId(legacyUserId: number): Promise<User | null>;
  existsByEmail(email: string): Promise<boolean>;
  list(filter?: { branchId?: string | null }): Promise<User[]>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
