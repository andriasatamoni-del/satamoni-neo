import { Inject, Injectable } from "@nestjs/common";
import { GoodsReceipt } from "../../domain/goods-receipt.aggregate";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";
import {
  DuplicateGoodsReceiptReferenceError,
  PurchaseOrderNotFoundError,
  PurchaseOrderNotReceivableError,
  GoodsReceiptSupplierMismatchError,
  GoodsReceiptBranchMismatchError,
} from "../../domain/errors";
import { assertWithinOrderedQuantity, confirmedReceivedByItem } from "../../domain/receipt-quantity-guard";
import { TransactionService } from "../../../../shared/database/transaction-context";
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";
import { RECEIVABLE_PURCHASE_ORDER_STATUSES } from "../../domain/purchase-order.aggregate";
import { PurchaseDuplicateCheckService } from "../../../../shared/procurement/purchase-duplicate-check.service";

export interface RegisterGoodsReceiptCommand {
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  supplierDocumentNumber?: string | null;
  branchId: string;
  lines: { inventoryItemId: string; quantity: number; unitCost: number; expiryDate?: Date | null; productionDate?: Date | null }[];
  receivedBy?: string | null;
  acknowledgeDuplicate?: boolean;
}

// بيسجّل إذن استلام DRAFT بس (مش بيرحّل مخزون لسه) - سواء مربوط بأمر شراء رسمي أو PO-less (مشترى
// نقدي سريع) - راجع تعليق GoodsReceipt.aggregate.ts. الترحيل الفعلي بيحصل في ConfirmGoodsReceiptHandler.
// فحص تكرار مرجع المورد (SAFE-1) قبل التسجيل - نفس منطق RegisterPurchaseHandler بالظبط، ومقابل نفس
// الجدولين (goods_receipts وpurchases) عشان نفس فاتورة التوريد الحقيقية ميترحلش مرتين من مسارين مختلفين
@Injectable()
export class RegisterGoodsReceiptHandler {
  constructor(
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly receipts: GoodsReceiptRepositoryPort,
    private readonly duplicateCheck: PurchaseDuplicateCheckService,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly purchaseOrders: PurchaseOrderRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: RegisterGoodsReceiptCommand): Promise<GoodsReceipt> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: RegisterGoodsReceiptCommand): Promise<GoodsReceipt> {
    // PO-linked receipts: validated against the purchase order under its row lock (concurrent registrations queue)
    if (command.purchaseOrderId) {
      if (!(await this.tx.lockRow("purchase_orders", command.purchaseOrderId))) throw new PurchaseOrderNotFoundError();
      const order = await this.purchaseOrders.findById(command.purchaseOrderId);
      if (!order) throw new PurchaseOrderNotFoundError();
      if (!RECEIVABLE_PURCHASE_ORDER_STATUSES.includes(order.status)) throw new PurchaseOrderNotReceivableError();
      if (order.branchId !== command.branchId) throw new GoodsReceiptBranchMismatchError();
      // the supplier of a PO-linked receipt is the PO's supplier (BL: GRN lost its supplier reference -> no AP at receipt)
      if (command.supplierId && command.supplierId !== order.supplierId) throw new GoodsReceiptSupplierMismatchError();
      command = { ...command, supplierId: order.supplierId };
      const linked = await this.receipts.list({ purchaseOrderId: order.id });
      assertWithinOrderedQuantity(order, confirmedReceivedByItem(linked), command.lines);
    }

    if (command.supplierId && command.supplierDocumentNumber && !command.acknowledgeDuplicate) {
      const duplicates = await this.duplicateCheck.findDuplicates({
        supplierId: command.supplierId,
        supplierDocumentNumber: command.supplierDocumentNumber,
        branchId: command.branchId,
      });
      if (duplicates.length > 0) throw new DuplicateGoodsReceiptReferenceError();
    }

    const receipt = GoodsReceipt.register(command);
    await this.receipts.save(receipt);
    return receipt;
  }
}
