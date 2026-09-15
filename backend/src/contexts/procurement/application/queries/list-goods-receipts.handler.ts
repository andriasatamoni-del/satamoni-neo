import { Inject, Injectable } from "@nestjs/common";
import { GoodsReceipt } from "../../domain/goods-receipt.aggregate";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";

@Injectable()
export class ListGoodsReceiptsHandler {
  constructor(@Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepositoryPort) {}

  async execute(filter?: { branchId?: string }): Promise<GoodsReceipt[]> {
    return this.receipts.list(filter);
  }
}
