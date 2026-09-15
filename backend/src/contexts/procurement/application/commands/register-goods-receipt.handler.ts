import { Inject, Injectable } from "@nestjs/common";
import { GoodsReceipt } from "../../domain/goods-receipt.aggregate";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";

export interface RegisterGoodsReceiptCommand {
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  branchId: string;
  lines: { inventoryItemId: string; quantity: number; unitCost: number }[];
  receivedBy?: string | null;
}

// بيسجّل إذن استلام DRAFT بس (مش بيرحّل مخزون لسه) - سواء مربوط بأمر شراء رسمي أو PO-less (مشترى
// نقدي سريع) - راجع تعليق GoodsReceipt.aggregate.ts. الترحيل الفعلي بيحصل في ConfirmGoodsReceiptHandler
@Injectable()
export class RegisterGoodsReceiptHandler {
  constructor(@Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepositoryPort) {}

  async execute(command: RegisterGoodsReceiptCommand): Promise<GoodsReceipt> {
    const receipt = GoodsReceipt.register(command);
    await this.receipts.save(receipt);
    return receipt;
  }
}
