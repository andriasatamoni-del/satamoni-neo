import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { PurchaseReturn } from "../purchase-return.aggregate";

export interface PurchaseReturnRepositoryPort {
  save(purchaseReturn: PurchaseReturn): Promise<void>;
  findById(id: string): Promise<PurchaseReturn | null>;
  list(filter?: { branchId?: string; supplierId?: string; status?: string }): Promise<PurchaseReturn[]>;
  listPage(filter?: { branchId?: string; supplierId?: string; status?: string }, page?: PageRequest): Promise<{ rows: PurchaseReturn[]; total: number }>;
}

export const PURCHASE_RETURN_REPOSITORY = Symbol("PURCHASE_RETURN_REPOSITORY");
