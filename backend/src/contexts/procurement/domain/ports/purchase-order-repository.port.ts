import type { PurchaseOrder } from "../purchase-order.aggregate";

export interface PurchaseOrderRepositoryPort {
  save(order: PurchaseOrder): Promise<void>;
  findById(id: string): Promise<PurchaseOrder | null>;
  findByLegacyPurchaseOrderId(legacyId: number): Promise<PurchaseOrder | null>;
  list(): Promise<PurchaseOrder[]>;
}

export const PURCHASE_ORDER_REPOSITORY = Symbol("PURCHASE_ORDER_REPOSITORY");
