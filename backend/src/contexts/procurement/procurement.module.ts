import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { InventoryModule } from "../inventory/inventory.module";
import { SUPPLIER_REPOSITORY } from "./domain/ports/supplier-repository.port";
import { PURCHASE_ORDER_REPOSITORY } from "./domain/ports/purchase-order-repository.port";
import { GOODS_RECEIPT_REPOSITORY } from "./domain/ports/goods-receipt-repository.port";
import { KyselySupplierRepository } from "./infrastructure/persistence/kysely-supplier.repository";
import { KyselyPurchaseOrderRepository } from "./infrastructure/persistence/kysely-purchase-order.repository";
import { KyselyGoodsReceiptRepository } from "./infrastructure/persistence/kysely-goods-receipt.repository";
import { RegisterSupplierHandler } from "./application/commands/register-supplier.handler";
import { RegisterPurchaseOrderHandler } from "./application/commands/register-purchase-order.handler";
import { RegisterGoodsReceiptHandler } from "./application/commands/register-goods-receipt.handler";
import { ConfirmGoodsReceiptHandler } from "./application/commands/confirm-goods-receipt.handler";
import { ListSuppliersHandler } from "./application/queries/list-suppliers.handler";
import { ListPurchaseOrdersHandler } from "./application/queries/list-purchase-orders.handler";
import { ListGoodsReceiptsHandler } from "./application/queries/list-goods-receipts.handler";
import { ProcurementController } from "./api/procurement.controller";

@Module({
  imports: [IdentityAccessModule, InventoryModule],
  controllers: [ProcurementController],
  providers: [
    { provide: SUPPLIER_REPOSITORY, useClass: KyselySupplierRepository },
    { provide: PURCHASE_ORDER_REPOSITORY, useClass: KyselyPurchaseOrderRepository },
    { provide: GOODS_RECEIPT_REPOSITORY, useClass: KyselyGoodsReceiptRepository },
    RegisterSupplierHandler,
    RegisterPurchaseOrderHandler,
    RegisterGoodsReceiptHandler,
    ConfirmGoodsReceiptHandler,
    ListSuppliersHandler,
    ListPurchaseOrdersHandler,
    ListGoodsReceiptsHandler,
  ],
  exports: [SUPPLIER_REPOSITORY, PURCHASE_ORDER_REPOSITORY, GOODS_RECEIPT_REPOSITORY],
})
export class ProcurementModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "procurement",
      groupLabel: "المشتريات والموردين",
      permissions: [
        { key: "procurement.suppliers.view", label: "رؤية الموردين" },
        { key: "procurement.suppliers.manage", label: "إدارة الموردين" },
        { key: "procurement.purchase_orders.view", label: "رؤية أوامر الشراء" },
        { key: "procurement.purchase_orders.manage", label: "إدارة أوامر الشراء" },
        { key: "procurement.goods_receipts.view", label: "رؤية أذون الاستلام" },
        { key: "procurement.goods_receipts.manage", label: "إدارة أذون الاستلام" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", [
      "procurement.suppliers.view",
      "procurement.purchase_orders.view",
      "procurement.goods_receipts.manage",
    ]);
    this.permissions.setRoleDefaults("accountant", ["procurement.suppliers.view", "procurement.purchase_orders.view"]);
  }
}
