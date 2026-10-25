import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Bank } from "../bank.aggregate";

export interface BankRepositoryPort {
  save(bank: Bank): Promise<void>;
  findById(id: string): Promise<Bank | null>;
  list(): Promise<Bank[]>;
  listPage(page?: PageRequest): Promise<{ rows: Bank[]; total: number }>;
}

export const BANK_REPOSITORY = Symbol("BANK_REPOSITORY");
