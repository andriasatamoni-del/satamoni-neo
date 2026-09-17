import type { Bank } from "../bank.aggregate";

export interface BankRepositoryPort {
  save(bank: Bank): Promise<void>;
  findById(id: string): Promise<Bank | null>;
  list(): Promise<Bank[]>;
}

export const BANK_REPOSITORY = Symbol("BANK_REPOSITORY");
