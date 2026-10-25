import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Purchase } from "../purchase.aggregate";

export interface PurchaseRepositoryPort {
  save(purchase: Purchase): Promise<void>;
  findById(id: string): Promise<Purchase | null>;
  list(filter?: { branchId?: string; businessDate?: Date; status?: string }): Promise<Purchase[]>;
  listPage(filter?: { branchId?: string; businessDate?: Date; status?: string }, page?: PageRequest): Promise<{ rows: Purchase[]; total: number }>;
}

export const PURCHASE_REPOSITORY = Symbol("PURCHASE_REPOSITORY");
