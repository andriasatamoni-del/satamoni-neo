import type { PurchaseReturn } from "../purchase-return.aggregate";

export interface PurchaseReturnRepositoryPort {
  save(purchaseReturn: PurchaseReturn): Promise<void>;
  findById(id: string): Promise<PurchaseReturn | null>;
  list(filter?: { branchId?: string; supplierId?: string; status?: string }): Promise<PurchaseReturn[]>;
}

export const PURCHASE_RETURN_REPOSITORY = Symbol("PURCHASE_RETURN_REPOSITORY");
