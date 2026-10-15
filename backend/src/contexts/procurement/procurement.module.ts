import { Module } from "@nestjs/common";
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
import { SupplierRepository } from "./infrastructure/persistence/supplier.repository";
import { PurchaseOrderRepository } from "./infrastructure/persistence/purchase-order.repository";
import { GoodsReceiptRepository } from "./infrastructure/persistence/goods-receipt.repository";
import { SupplierInvoiceRepository } from "./infrastructure/persistence/supplier-invoice.repository";
import { SupplierPaymentRepository } from "./infrastructure/persistence/supplier-payment.repository";
import { SupplierBalanceReader } from "./infrastructure/persistence/supplier-balance-reader";
import { PurchaseRequestRepository } from "./infrastructure/persistence/purchase-request.repository";
import { PurchaseReturnRepository } from "./infrastructure/persistence/purchase-return.repository";
import { RegisterSupplierHandler } from "./application/commands/register-supplier.handler";
import { RegisterPurchaseOrderHandler } from "./application/commands/register-purchase-order.handler";
import { SendPurchaseOrderHandler } from "./application/commands/send-purchase-order.handler";
import { CancelPurchaseOrderHandler } from "./application/commands/cancel-purchase-order.handler";
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
import { GetPurchaseOrderReceiptProgressHandler } from "./application/queries/get-purchase-order-receipt-progress.handler";
import { ListSupplierInvoicesHandler } from "./application/queries/list-supplier-invoices.handler";
import { GetSupplierInvoiceHandler } from "./application/queries/get-supplier-invoice.handler";
import { ListSupplierPaymentsHandler } from "./application/queries/list-supplier-payments.handler";
import { GetSupplierBalanceHandler } from "./application/queries/get-supplier-balance.handler";
import { ListPurchaseRequestsHandler } from "./application/queries/list-purchase-requests.handler";
import { GetPurchaseRequestHandler } from "./application/queries/get-purchase-request.handler";
import { ListPurchaseReturnsHandler } from "./application/queries/list-purchase-returns.handler";
import { GetPurchaseReturnHandler } from "./application/queries/get-purchase-return.handler";
import { PurchaseDuplicateCheckService } from "../../shared/procurement/purchase-duplicate-check.service";
import { ProcurementController } from "./api/procurement.controller";

@Module({
  imports: [IdentityAccessModule, InventoryModule, AccountingModule, TreasuryModule],
  controllers: [ProcurementController],
  providers: [
    { provide: SUPPLIER_REPOSITORY, useClass: SupplierRepository },
    { provide: PURCHASE_ORDER_REPOSITORY, useClass: PurchaseOrderRepository },
    { provide: GOODS_RECEIPT_REPOSITORY, useClass: GoodsReceiptRepository },
    { provide: SUPPLIER_INVOICE_REPOSITORY, useClass: SupplierInvoiceRepository },
    { provide: SUPPLIER_PAYMENT_REPOSITORY, useClass: SupplierPaymentRepository },
    { provide: SUPPLIER_BALANCE_READER, useClass: SupplierBalanceReader },
    { provide: PURCHASE_REQUEST_REPOSITORY, useClass: PurchaseRequestRepository },
    { provide: PURCHASE_RETURN_REPOSITORY, useClass: PurchaseReturnRepository },
    PurchaseDuplicateCheckService,
    RegisterSupplierHandler,
    RegisterPurchaseOrderHandler,
    SendPurchaseOrderHandler,
    CancelPurchaseOrderHandler,
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
    GetPurchaseOrderReceiptProgressHandler,
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
export class ProcurementModule {}
