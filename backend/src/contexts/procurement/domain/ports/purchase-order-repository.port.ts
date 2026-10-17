import type { PurchaseOrder } from "../purchase-order.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the procurement document lists. `q` matches the supplier name; `from`/`to` are Cairo dates on created_at.
export interface ProcurementDocumentListFilter {
  branchId?: string;
  status?: string;
  supplierId?: string;
  q?: string;
  from?: string;
  to?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface PurchaseOrderRepositoryPort {
  save(order: PurchaseOrder): Promise<void>;
  findById(id: string): Promise<PurchaseOrder | null>;
  findByLegacyPurchaseOrderId(legacyId: number): Promise<PurchaseOrder | null>;
  list(): Promise<PurchaseOrder[]>;
  search(filter: ProcurementDocumentListFilter, page?: PageRequest): Promise<{ orders: PurchaseOrder[]; total: number }>;
}

export const PURCHASE_ORDER_REPOSITORY = Symbol("PURCHASE_ORDER_REPOSITORY");
