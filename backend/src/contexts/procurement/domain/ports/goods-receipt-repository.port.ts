import type { GoodsReceipt } from "../goods-receipt.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { ProcurementDocumentListFilter } from "./purchase-order-repository.port";

export interface GoodsReceiptRepositoryPort {
  save(receipt: GoodsReceipt): Promise<void>;
  findById(id: string): Promise<GoodsReceipt | null>;
  findByLegacyGoodsReceiptId(legacyId: number): Promise<GoodsReceipt | null>;
  list(filter?: { branchId?: string; purchaseOrderId?: string }): Promise<GoodsReceipt[]>;
  search(filter: ProcurementDocumentListFilter, page?: PageRequest): Promise<{ receipts: GoodsReceipt[]; total: number }>;
}

export const GOODS_RECEIPT_REPOSITORY = Symbol("GOODS_RECEIPT_REPOSITORY");
