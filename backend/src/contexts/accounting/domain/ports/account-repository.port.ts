import type { Account } from "../account.aggregate";

export interface AccountRepositoryPort {
  save(account: Account): Promise<void>;
  findById(id: string): Promise<Account | null>;
  findByCode(code: string): Promise<Account | null>;
  existsByCode(code: string): Promise<boolean>;
  findByLegacyAccountId(legacyId: number): Promise<Account | null>;
  list(): Promise<Account[]>;
}

export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");
