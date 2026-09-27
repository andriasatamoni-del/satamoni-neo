import type { Purchase } from "../purchase.aggregate";

export interface PurchaseRepositoryPort {
  save(purchase: Purchase): Promise<void>;
  findById(id: string): Promise<Purchase | null>;
  list(filter?: { branchId?: string; businessDate?: Date; status?: string }): Promise<Purchase[]>;
}

export const PURCHASE_REPOSITORY = Symbol("PURCHASE_REPOSITORY");
