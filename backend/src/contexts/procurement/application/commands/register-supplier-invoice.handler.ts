import { Inject, Injectable } from "@nestjs/common";
import { SupplierInvoice } from "../../domain/supplier-invoice.aggregate";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";
import { SUPPLIER_REPOSITORY, type SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";
import {
  GOODS_RECEIPT_REPOSITORY,
  type GoodsReceiptRepositoryPort,
} from "../../domain/ports/goods-receipt-repository.port";
import { DuplicateSupplierInvoiceNumberError, SupplierNotFoundError } from "../../domain/errors";

export interface RegisterSupplierInvoiceCommand {
  supplierId: string;
  branchId: string;
  goodsReceiptId?: string | null;
  supplierInvoiceNumber: string;
  invoiceDate?: Date;
  dueDate?: Date | null;
  lines: { inventoryItemId: string; invoicedQuantity: number; unitPrice: number }[];
  tax?: number;
  notes?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class RegisterSupplierInvoiceHandler {
  constructor(
    @Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepositoryPort,
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly goodsReceipts: GoodsReceiptRepositoryPort
  ) {}

  async execute(command: RegisterSupplierInvoiceCommand): Promise<SupplierInvoice> {
    if (!(await this.suppliers.findById(command.supplierId))) throw new SupplierNotFoundError();
    if (await this.invoices.existsBySupplierAndNumber(command.supplierId, command.supplierInvoiceNumber)) {
      throw new DuplicateSupplierInvoiceNumberError();
    }

    // مطابقة على مستوى الاستلام كله (مش سطر بسطر زي الريبو القديم - راجع تعليق SupplierInvoice) - لو
    // الاستلام مش لنفس المورد/الفرع أو لسه مش CONFIRMED، بنتجاهل الربط (matchedTotal = 0) بدل ما نرفض
    // تسجيل الفاتورة كلها؛ الفرق هيظهر كامل كـvariance وهو سلوك آمن ومنطقي هنا
    let matchedTotal = 0;
    if (command.goodsReceiptId) {
      const receipt = await this.goodsReceipts.findById(command.goodsReceiptId);
      if (receipt && receipt.status === "CONFIRMED" && receipt.supplierId === command.supplierId && receipt.branchId === command.branchId) {
        matchedTotal = receipt.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
      }
    }

    const invoice = SupplierInvoice.register({ ...command, matchedTotal });
    await this.invoices.save(invoice);
    return invoice;
  }
}
