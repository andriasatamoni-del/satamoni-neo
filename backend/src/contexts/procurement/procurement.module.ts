import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { InventoryModule } from "../inventory/inventory.module";
import { AccountingModule } from "../accounting/accounting.module";
import { TreasuryModule } from "../treasury/treasury.module";
import { SUPPLIER_REPOSITORY } from "./domain/ports/supplier-repository.port";
import { PURCHASE_ORDER_REPOSITORY } from "./domain/ports/purchase-order-repository.port";
import { GOODS_RECEIPT_REPOSITORY } from "./domain/ports/goods-receipt-repository.port";
import { SUPPLIER_INVOICE_REPOSITORY } from "./domain/ports/supplier-invoice-repository.port";
import { SUPPLIER_PAYMENT_REPOSITORY } from "./domain/ports/supplier-payment-repository.port";
import { SUPPLIER_BALANCE_READER } from "./domain/ports/supplier-balance-reader.port";
import { KyselySupplierRepository } from "./infrastructure/persistence/kysely-supplier.repository";
import { KyselyPurchaseOrderRepository } from "./infrastructure/persistence/kysely-purchase-order.repository";
import { KyselyGoodsReceiptRepository } from "./infrastructure/persistence/kysely-goods-receipt.repository";
import { KyselySupplierInvoiceRepository } from "./infrastructure/persistence/kysely-supplier-invoice.repository";
import { KyselySupplierPaymentRepository } from "./infrastructure/persistence/kysely-supplier-payment.repository";
import { KyselySupplierBalanceReader } from "./infrastructure/persistence/kysely-supplier-balance-reader";
import { RegisterSupplierHandler } from "./application/commands/register-supplier.handler";
import { RegisterPurchaseOrderHandler } from "./application/commands/register-purchase-order.handler";
import { RegisterGoodsReceiptHandler } from "./application/commands/register-goods-receipt.handler";
import { ConfirmGoodsReceiptHandler } from "./application/commands/confirm-goods-receipt.handler";
import { RegisterSupplierInvoiceHandler } from "./application/commands/register-supplier-invoice.handler";
import { ApproveSupplierInvoiceHandler } from "./application/commands/approve-supplier-invoice.handler";
import { CancelSupplierInvoiceHandler } from "./application/commands/cancel-supplier-invoice.handler";
import { RegisterSupplierPaymentHandler } from "./application/commands/register-supplier-payment.handler";
import { ListSuppliersHandler } from "./application/queries/list-suppliers.handler";
import { ListPurchaseOrdersHandler } from "./application/queries/list-purchase-orders.handler";
import { ListGoodsReceiptsHandler } from "./application/queries/list-goods-receipts.handler";
import { ListSupplierInvoicesHandler } from "./application/queries/list-supplier-invoices.handler";
import { GetSupplierInvoiceHandler } from "./application/queries/get-supplier-invoice.handler";
import { ListSupplierPaymentsHandler } from "./application/queries/list-supplier-payments.handler";
import { GetSupplierBalanceHandler } from "./application/queries/get-supplier-balance.handler";
import { ProcurementController } from "./api/procurement.controller";

@Module({
  imports: [IdentityAccessModule, InventoryModule, AccountingModule, TreasuryModule],
  controllers: [ProcurementController],
  providers: [
    { provide: SUPPLIER_REPOSITORY, useClass: KyselySupplierRepository },
    { provide: PURCHASE_ORDER_REPOSITORY, useClass: KyselyPurchaseOrderRepository },
    { provide: GOODS_RECEIPT_REPOSITORY, useClass: KyselyGoodsReceiptRepository },
    { provide: SUPPLIER_INVOICE_REPOSITORY, useClass: KyselySupplierInvoiceRepository },
    { provide: SUPPLIER_PAYMENT_REPOSITORY, useClass: KyselySupplierPaymentRepository },
    { provide: SUPPLIER_BALANCE_READER, useClass: KyselySupplierBalanceReader },
    RegisterSupplierHandler,
    RegisterPurchaseOrderHandler,
    RegisterGoodsReceiptHandler,
    ConfirmGoodsReceiptHandler,
    RegisterSupplierInvoiceHandler,
    ApproveSupplierInvoiceHandler,
    CancelSupplierInvoiceHandler,
    RegisterSupplierPaymentHandler,
    ListSuppliersHandler,
    ListPurchaseOrdersHandler,
    ListGoodsReceiptsHandler,
    ListSupplierInvoicesHandler,
    GetSupplierInvoiceHandler,
    ListSupplierPaymentsHandler,
    GetSupplierBalanceHandler,
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

    // نفس namespace الريبو القديم بالظبط (purchasing.* منفصل عن procurement.* - فاتورة/سداد المورد
    // طبقة مالية فوق دورة الشراء، مش جزء من إدارتها الأساسية)
    this.permissions.registerGroup({
      group: "purchasing",
      groupLabel: "فواتير وسدادات الموردين",
      permissions: [
        { key: "purchasing.view", label: "رؤية فواتير وسدادات الموردين" },
        { key: "purchasing.create", label: "تسجيل فاتورة/سداد مورد" },
        { key: "purchasing.approve", label: "اعتماد فاتورة مورد" },
        { key: "purchasing.cancel", label: "إلغاء فاتورة مورد" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["purchasing.view", "purchasing.create"]);
    this.permissions.setRoleDefaults("accountant", ["purchasing.view", "purchasing.create", "purchasing.approve", "purchasing.cancel"]);
  }
}
