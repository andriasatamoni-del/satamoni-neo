import { Inject, Injectable } from "@nestjs/common";
import { PurchaseOrder } from "../../domain/purchase-order.aggregate";
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";
import { SUPPLIER_REPOSITORY, type SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";
import { SupplierNotFoundError } from "../../domain/errors";

export interface RegisterPurchaseOrderCommand {
  supplierId: string;
  branchId: string;
  lines: { inventoryItemId: string; quantity: number; unitPrice: number }[];
  createdBy?: string | null;
}

@Injectable()
export class RegisterPurchaseOrderHandler {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepositoryPort,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepositoryPort
  ) {}

  async execute(command: RegisterPurchaseOrderCommand): Promise<PurchaseOrder> {
    const supplier = await this.suppliers.findById(command.supplierId);
    if (!supplier) throw new SupplierNotFoundError();

    const order = PurchaseOrder.register(command);
    await this.orders.save(order);
    return order;
  }
}
