import type { GoodsReceipt } from "../goods-receipt.aggregate";

export interface GoodsReceiptRepositoryPort {
  save(receipt: GoodsReceipt): Promise<void>;
  findById(id: string): Promise<GoodsReceipt | null>;
  findByLegacyGoodsReceiptId(legacyId: number): Promise<GoodsReceipt | null>;
  list(filter?: { branchId?: string }): Promise<GoodsReceipt[]>;
}

export const GOODS_RECEIPT_REPOSITORY = Symbol("GOODS_RECEIPT_REPOSITORY");
