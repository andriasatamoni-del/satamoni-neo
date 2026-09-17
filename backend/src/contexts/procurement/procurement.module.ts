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
import { PURCHASE_REQUEST_REPOSITORY } from "./domain/ports/purchase-request-repository.port";
import { PURCHASE_RETURN_REPOSITORY } from "./domain/ports/purchase-return-repository.port";
import { KyselySupplierRepository } from "./infrastructure/persistence/kysely-supplier.repository";
import { KyselyPurchaseOrderRepository } from "./infrastructure/persistence/kysely-purchase-order.repository";
import { KyselyGoodsReceiptRepository } from "./infrastructure/persistence/kysely-goods-receipt.repository";
import { KyselySupplierInvoiceRepository } from "./infrastructure/persistence/kysely-supplier-invoice.repository";
import { KyselySupplierPaymentRepository } from "./infrastructure/persistence/kysely-supplier-payment.repository";
import { KyselySupplierBalanceReader } from "./infrastructure/persistence/kysely-supplier-balance-reader";
import { KyselyPurchaseRequestRepository } from "./infrastructure/persistence/kysely-purchase-request.repository";
import { KyselyPurchaseReturnRepository } from "./infrastructure/persistence/kysely-purchase-return.repository";
import { RegisterSupplierHandler } from "./application/commands/register-supplier.handler";
import { RegisterPurchaseOrderHandler } from "./application/commands/register-purchase-order.handler";
import { RegisterGoodsReceiptHandler } from "./application/commands/register-goods-receipt.handler";
import { ConfirmGoodsReceiptHandler } from "./application/commands/confirm-goods-receipt.handler";
import { RegisterSupplierInvoiceHandler } from "./application/commands/register-supplier-invoice.handler";
import { ApproveSupplierInvoiceHandler } from "./application/commands/approve-supplier-invoice.handler";
import { CancelSupplierInvoiceHandler } from "./application/commands/cancel-supplier-invoice.handler";
import { RegisterSupplierPaymentHandler } from "./application/commands/register-supplier-payment.handler";
import { RegisterPurchaseRequestHandler } from "./application/commands/register-purchase-request.handler";
import { EditPurchaseRequestHandler } from "./application/commands/edit-purchase-request.handler";
import { SubmitPurchaseRequestHandler } from "./application/commands/submit-purchase-request.handler";
import { ApprovePurchaseRequestHandler } from "./application/commands/approve-purchase-request.handler";
import { RejectPurchaseRequestHandler } from "./application/commands/reject-purchase-request.handler";
import { CancelPurchaseRequestHandler } from "./application/commands/cancel-purchase-request.handler";
import { RegisterPurchaseReturnHandler } from "./application/commands/register-purchase-return.handler";
import { PostPurchaseReturnHandler } from "./application/commands/post-purchase-return.handler";
import { CancelPurchaseReturnHandler } from "./application/commands/cancel-purchase-return.handler";
import { ListSuppliersHandler } from "./application/queries/list-suppliers.handler";
import { ListPurchaseOrdersHandler } from "./application/queries/list-purchase-orders.handler";
import { ListGoodsReceiptsHandler } from "./application/queries/list-goods-receipts.handler";
import { ListSupplierInvoicesHandler } from "./application/queries/list-supplier-invoices.handler";
import { GetSupplierInvoiceHandler } from "./application/queries/get-supplier-invoice.handler";
import { ListSupplierPaymentsHandler } from "./application/queries/list-supplier-payments.handler";
import { GetSupplierBalanceHandler } from "./application/queries/get-supplier-balance.handler";
import { ListPurchaseRequestsHandler } from "./application/queries/list-purchase-requests.handler";
import { GetPurchaseRequestHandler } from "./application/queries/get-purchase-request.handler";
import { ListPurchaseReturnsHandler } from "./application/queries/list-purchase-returns.handler";
import { GetPurchaseReturnHandler } from "./application/queries/get-purchase-return.handler";
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
    { provide: PURCHASE_REQUEST_REPOSITORY, useClass: KyselyPurchaseRequestRepository },
    { provide: PURCHASE_RETURN_REPOSITORY, useClass: KyselyPurchaseReturnRepository },
    RegisterSupplierHandler,
    RegisterPurchaseOrderHandler,
    RegisterGoodsReceiptHandler,
    ConfirmGoodsReceiptHandler,
    RegisterSupplierInvoiceHandler,
    ApproveSupplierInvoiceHandler,
    CancelSupplierInvoiceHandler,
    RegisterSupplierPaymentHandler,
    RegisterPurchaseRequestHandler,
    EditPurchaseRequestHandler,
    SubmitPurchaseRequestHandler,
    ApprovePurchaseRequestHandler,
    RejectPurchaseRequestHandler,
    CancelPurchaseRequestHandler,
    RegisterPurchaseReturnHandler,
    PostPurchaseReturnHandler,
    CancelPurchaseReturnHandler,
    ListSuppliersHandler,
    ListPurchaseOrdersHandler,
    ListGoodsReceiptsHandler,
    ListSupplierInvoicesHandler,
    GetSupplierInvoiceHandler,
    ListSupplierPaymentsHandler,
    GetSupplierBalanceHandler,
    ListPurchaseRequestsHandler,
    GetPurchaseRequestHandler,
    ListPurchaseReturnsHandler,
    GetPurchaseReturnHandler,
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
    // وطلبات الشراء ومرتجعاتها طبقة فوق دورة الشراء الأساسية، مش جزء من إدارتها الأساسية). purchasing.submit
    // منفصلة عن purchasing.create - نفس فرق الريبو القديم بين "يعمل طلب" و"يقدّمه للاعتماد"
    this.permissions.registerGroup({
      group: "purchasing",
      groupLabel: "فواتير وسدادات وطلبات ومرتجعات الموردين",
      permissions: [
        { key: "purchasing.view", label: "رؤية فواتير/سدادات/طلبات/مرتجعات الموردين" },
        { key: "purchasing.create", label: "تسجيل فاتورة/سداد/طلب شراء/مرتجع مورد" },
        { key: "purchasing.submit", label: "تقديم طلب شراء للاعتماد" },
        { key: "purchasing.approve", label: "اعتماد فاتورة مورد أو طلب شراء" },
        { key: "purchasing.cancel", label: "إلغاء فاتورة مورد أو طلب شراء أو مرتجع" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["purchasing.view", "purchasing.create", "purchasing.submit"]);
    this.permissions.setRoleDefaults("accountant", [
      "purchasing.view",
      "purchasing.create",
      "purchasing.submit",
      "purchasing.approve",
      "purchasing.cancel",
    ]);
  }
}
