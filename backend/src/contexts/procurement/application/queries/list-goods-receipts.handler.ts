import { Inject, Injectable } from "@nestjs/common";
import { GoodsReceipt } from "../../domain/goods-receipt.aggregate";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";
import type { ProcurementDocumentListFilter } from "../../domain/ports/purchase-order-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListGoodsReceiptsHandler {
  constructor(@Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepositoryPort) {}

  async execute(filter: ProcurementDocumentListFilter = {}, page?: PageRequest): Promise<{ receipts: GoodsReceipt[]; total: number }> {
    return this.receipts.search(filter, page);
  }
}
