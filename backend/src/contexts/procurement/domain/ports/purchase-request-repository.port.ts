import type { PurchaseRequest } from "../purchase-request.aggregate";

export interface PurchaseRequestRepositoryPort {
  save(request: PurchaseRequest): Promise<void>;
  findById(id: string): Promise<PurchaseRequest | null>;
  list(filter?: { branchId?: string; status?: string }): Promise<PurchaseRequest[]>;
}

export const PURCHASE_REQUEST_REPOSITORY = Symbol("PURCHASE_REQUEST_REPOSITORY");
