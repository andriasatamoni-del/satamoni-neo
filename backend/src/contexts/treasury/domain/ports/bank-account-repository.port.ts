import type { BankAccount } from "../bank-account.aggregate";

export interface BankAccountRepositoryPort {
  save(bankAccount: BankAccount): Promise<void>;
  findById(id: string): Promise<BankAccount | null>;
  list(): Promise<BankAccount[]>;
}

export const BANK_ACCOUNT_REPOSITORY = Symbol("BANK_ACCOUNT_REPOSITORY");
