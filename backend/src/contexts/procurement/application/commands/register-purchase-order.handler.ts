import { Inject, Injectable } from "@nestjs/common";
import { PurchaseOrder } from "../../domain/purchase-order.aggregate";
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";
import { SUPPLIER_REPOSITORY, type SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";
import {
  PURCHASE_REQUEST_REPOSITORY,
  type PurchaseRequestRepositoryPort,
} from "../../domain/ports/purchase-request-repository.port";
import { PurchaseRequestNotConvertibleError, PurchaseRequestNotFoundError, SupplierNotFoundError } from "../../domain/errors";

export interface RegisterPurchaseOrderCommand {
  supplierId: string;
  branchId: string;
  purchaseRequestId?: string | null;
  lines: { inventoryItemId: string; quantity: number; unitPrice: number }[];
  createdBy?: string | null;
}

// لو purchaseRequestId اتبعت، لازم الطلب يكون APPROVED (بيرمي PurchaseRequestNotConvertibleError لو
// لأ - راجع PurchaseRequest.markConvertedToPurchaseOrder) وبيتحوّل تلقائيًا لـCONVERTED_TO_PO بعد ما
// أمر الشراء يتسجّل - نفس فلسفة الريبو القديم بالظبط (تحويل PR لPO بيحصل كأثر جانبي لإنشاء PO مش endpoint منفصل)
@Injectable()
export class RegisterPurchaseOrderHandler {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepositoryPort,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepositoryPort,
    @Inject(PURCHASE_REQUEST_REPOSITORY) private readonly purchaseRequests: PurchaseRequestRepositoryPort
  ) {}

  async execute(command: RegisterPurchaseOrderCommand): Promise<PurchaseOrder> {
    const supplier = await this.suppliers.findById(command.supplierId);
    if (!supplier) throw new SupplierNotFoundError();

    let purchaseRequest = null;
    if (command.purchaseRequestId) {
      purchaseRequest = await this.purchaseRequests.findById(command.purchaseRequestId);
      if (!purchaseRequest) throw new PurchaseRequestNotFoundError();
      // بيتأكد من الحالة الأول قبل ما ننشئ أي حاجة - عشان مانسيبش أمر شراء يتيم لو الطلب مش APPROVED
      if (purchaseRequest.status !== "APPROVED") throw new PurchaseRequestNotConvertibleError();
    }

    const order = PurchaseOrder.register(command);
    await this.orders.save(order);

    if (purchaseRequest) {
      purchaseRequest.markConvertedToPurchaseOrder(order.id);
      await this.purchaseRequests.save(purchaseRequest);
    }

    return order;
  }
}
