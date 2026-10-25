import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { PurchaseRequest } from "../purchase-request.aggregate";

export interface PurchaseRequestRepositoryPort {
  save(request: PurchaseRequest): Promise<void>;
  findById(id: string): Promise<PurchaseRequest | null>;
  list(filter?: { branchId?: string; status?: string }): Promise<PurchaseRequest[]>;
  listPage(filter?: { branchId?: string; status?: string }, page?: PageRequest): Promise<{ rows: PurchaseRequest[]; total: number }>;
}

export const PURCHASE_REQUEST_REPOSITORY = Symbol("PURCHASE_REQUEST_REPOSITORY");
