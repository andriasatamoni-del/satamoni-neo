// كل جداول النظام مجمّعة هنا في نوع واحد لـKysely - كل context بيضيف نوع الجدول بتاعه هنا (composition
// صريحة، مش declaration merging) وقت ما يتبني. schema واحد مشترك لأننا لسه مونوليث معياري واحد
// (راجع خطة إعادة البناء قسم 1) - لو أي context اتفصل لخدمة منفصلة لاحقًا، جدوله بس بتتشال من هنا.
import type { UsersTable } from "../../contexts/identity-access/infrastructure/persistence/user.schema";
import type { EventOutboxTable } from "../events/event-outbox.schema";
import type { CustomerFollowupsTable } from "../../contexts/crm/infrastructure/persistence/customer-followup.schema";
import type { ComplaintsTable } from "../../contexts/crm/infrastructure/persistence/complaint.schema";
import type { BranchesTable } from "../../contexts/branches/infrastructure/persistence/branch.schema";
import type { InventoryItemsTable } from "../../contexts/inventory/infrastructure/persistence/inventory-item.schema";
import type {
  StockMovementsTable,
  BranchStockBalancesTable,
} from "../../contexts/inventory/infrastructure/persistence/stock-movement.schema";
import type {
  MenuCategoriesTable,
  MenuItemsTable,
  MenuItemVariantsTable,
  RecipesTable,
  RecipeVersionsTable,
  RecipeIngredientsTable,
} from "../../contexts/catalog/infrastructure/persistence/catalog.schema";
import type {
  SuppliersTable,
  PurchaseOrdersTable,
  PurchaseOrderItemsTable,
  GoodsReceiptsTable,
  GoodsReceiptItemsTable,
  SupplierInvoicesTable,
  SupplierInvoiceLinesTable,
  SupplierPaymentsTable,
  PurchaseRequestsTable,
  PurchaseRequestItemsTable,
  PurchaseReturnsTable,
  PurchaseReturnItemsTable,
} from "../../contexts/procurement/infrastructure/persistence/procurement.schema";
import type { OrdersTable, OrderItemsTable } from "../../contexts/orders/infrastructure/persistence/order.schema";
import type {
  DriversTable,
  DeliveryAssignmentsTable,
  DriverSettlementsTable,
  DriverAttendanceShiftsTable,
} from "../../contexts/delivery/infrastructure/persistence/delivery.schema";
import type {
  AccountsTable,
  JournalEntriesTable,
  JournalEntryLinesTable,
} from "../../contexts/accounting/infrastructure/persistence/accounting.schema";
import type {
  PaymentMethodsTable,
  PaymentsTable,
  PaymentAdjustmentRequestsTable,
  PaymentReconciliationRecordsTable,
} from "../../contexts/payment-control/infrastructure/persistence/payment-control.schema";
import type {
  EmployeesTable,
  PayrollRunsTable,
  PayrollRunEmployeesTable,
} from "../../contexts/hr-payroll/infrastructure/persistence/hr-payroll.schema";
import type { CashierShiftsTable } from "../../contexts/shifts/infrastructure/persistence/cashier-shift.schema";
import type {
  TreasuriesTable,
  BanksTable,
  BankAccountsTable,
} from "../../contexts/treasury/infrastructure/persistence/treasury.schema";

export interface Database {
  users: UsersTable;
  event_outbox: EventOutboxTable;
  customer_followups: CustomerFollowupsTable;
  complaints: ComplaintsTable;
  branches: BranchesTable;
  inventory_items: InventoryItemsTable;
  stock_movements: StockMovementsTable;
  branch_stock_balances: BranchStockBalancesTable;
  menu_categories: MenuCategoriesTable;
  menu_items: MenuItemsTable;
  menu_item_variants: MenuItemVariantsTable;
  recipes: RecipesTable;
  recipe_versions: RecipeVersionsTable;
  recipe_ingredients: RecipeIngredientsTable;
  suppliers: SuppliersTable;
  purchase_orders: PurchaseOrdersTable;
  purchase_order_items: PurchaseOrderItemsTable;
  goods_receipts: GoodsReceiptsTable;
  goods_receipt_items: GoodsReceiptItemsTable;
  supplier_invoices: SupplierInvoicesTable;
  supplier_invoice_lines: SupplierInvoiceLinesTable;
  supplier_payments: SupplierPaymentsTable;
  purchase_requests: PurchaseRequestsTable;
  purchase_request_items: PurchaseRequestItemsTable;
  purchase_returns: PurchaseReturnsTable;
  purchase_return_items: PurchaseReturnItemsTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  drivers: DriversTable;
  delivery_assignments: DeliveryAssignmentsTable;
  driver_settlements: DriverSettlementsTable;
  driver_attendance_shifts: DriverAttendanceShiftsTable;
  accounts: AccountsTable;
  journal_entries: JournalEntriesTable;
  journal_entry_lines: JournalEntryLinesTable;
  payment_methods: PaymentMethodsTable;
  payments: PaymentsTable;
  payment_adjustment_requests: PaymentAdjustmentRequestsTable;
  payment_reconciliation_records: PaymentReconciliationRecordsTable;
  employees: EmployeesTable;
  payroll_runs: PayrollRunsTable;
  payroll_run_employees: PayrollRunEmployeesTable;
  cashier_shifts: CashierShiftsTable;
  treasuries: TreasuriesTable;
  banks: BanksTable;
  bank_accounts: BankAccountsTable;
}
