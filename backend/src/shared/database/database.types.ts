// كل جداول النظام مجمّعة هنا في نوع واحد لـKysely - كل context بيضيف نوع الجدول بتاعه هنا (composition
// صريحة، مش declaration merging) وقت ما يتبني. schema واحد مشترك لأننا لسه مونوليث معياري واحد
// (راجع خطة إعادة البناء قسم 1) - لو أي context اتفصل لخدمة منفصلة لاحقًا، جدوله بس بتتشال من هنا.
import type { UsersTable } from "../../contexts/identity-access/infrastructure/persistence/user.schema";
import type { EventOutboxTable } from "../events/event-outbox.schema";
import type { AuditLogsTable } from "../audit/audit-log.schema";
import type { CustomerFollowupsTable } from "../../contexts/crm/infrastructure/persistence/customer-followup.schema";
import type { ComplaintsTable } from "../../contexts/crm/infrastructure/persistence/complaint.schema";
import type {
  WhatsappConversationsTable,
  WhatsappMessagesTable,
  WhatsappPendingOrdersTable,
  WhatsappPendingOrderLinesTable,
} from "../../contexts/whatsapp/infrastructure/persistence/whatsapp.schema";
import type { BranchesTable } from "../../contexts/branches/infrastructure/persistence/branch.schema";
import type { InventoryItemsTable } from "../../contexts/inventory/infrastructure/persistence/inventory-item.schema";
import type {
  StockMovementsTable,
  BranchStockBalancesTable,
} from "../../contexts/inventory/infrastructure/persistence/stock-movement.schema";
import type { StocktakesTable, StocktakeLinesTable } from "../../contexts/inventory/infrastructure/persistence/stocktake.schema";
import type {
  ConversionOrdersTable,
  ConversionOrderInputLinesTable,
} from "../../contexts/production/infrastructure/persistence/conversion-order.schema";
import type {
  MenuCategoriesTable,
  MenuItemsTable,
  MenuItemVariantsTable,
  MenuItemModifiersTable,
  MenuItemModifierVariantPricesTable,
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
import type {
  OrdersTable,
  OrderItemsTable,
  OrderRatingsTable,
  OrderItemModifiersTable,
} from "../../contexts/orders/infrastructure/persistence/order.schema";
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
  AccountingPeriodsTable,
  FiscalYearClosingsTable,
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
  EmployeeLeaveRequestsTable,
  EmployeeAttendanceShiftsTable,
  PayrollAdjustmentsTable,
} from "../../contexts/hr-payroll/infrastructure/persistence/hr-payroll.schema";
import type { CashierShiftsTable } from "../../contexts/shifts/infrastructure/persistence/cashier-shift.schema";
import type { CashDrawerEntriesTable } from "../../contexts/shifts/infrastructure/persistence/cash-drawer-entry.schema";
import type {
  TreasuriesTable,
  BanksTable,
  BankAccountsTable,
} from "../../contexts/treasury/infrastructure/persistence/treasury.schema";
import type {
  PrintersTable,
  KitchenStationsTable,
  PrintJobsTable,
} from "../../contexts/printing/infrastructure/persistence/printing.schema";
import type { PosSettingsTable } from "../../contexts/settings/infrastructure/persistence/pos-settings.schema";
import type { BranchDaysTable } from "../../contexts/branch-day/infrastructure/persistence/branch-day.schema";
import type { BranchStockThresholdsTable } from "../../contexts/inventory/infrastructure/persistence/branch-stock-threshold.schema";
import type {
  TransferRequestsTable,
  TransferRequestLinesTable,
} from "../../contexts/inventory/infrastructure/persistence/transfer-request.schema";
import type { ExpenseCategoriesTable } from "../../contexts/expenses/infrastructure/persistence/expense-category.schema";
import type { ExpensesTable } from "../../contexts/expenses/infrastructure/persistence/expense.schema";
import type { PurchasesTable, PurchaseLinesTable } from "../../contexts/purchases/infrastructure/persistence/purchase.schema";

export interface Database {
  users: UsersTable;
  event_outbox: EventOutboxTable;
  audit_logs: AuditLogsTable;
  customer_followups: CustomerFollowupsTable;
  complaints: ComplaintsTable;
  whatsapp_conversations: WhatsappConversationsTable;
  whatsapp_messages: WhatsappMessagesTable;
  whatsapp_pending_orders: WhatsappPendingOrdersTable;
  whatsapp_pending_order_lines: WhatsappPendingOrderLinesTable;
  branches: BranchesTable;
  inventory_items: InventoryItemsTable;
  stock_movements: StockMovementsTable;
  branch_stock_balances: BranchStockBalancesTable;
  stocktakes: StocktakesTable;
  conversion_orders: ConversionOrdersTable;
  conversion_order_input_lines: ConversionOrderInputLinesTable;
  stocktake_lines: StocktakeLinesTable;
  menu_categories: MenuCategoriesTable;
  menu_items: MenuItemsTable;
  menu_item_variants: MenuItemVariantsTable;
  menu_item_modifiers: MenuItemModifiersTable;
  menu_item_modifier_variant_prices: MenuItemModifierVariantPricesTable;
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
  order_item_modifiers: OrderItemModifiersTable;
  order_ratings: OrderRatingsTable;
  drivers: DriversTable;
  delivery_assignments: DeliveryAssignmentsTable;
  driver_settlements: DriverSettlementsTable;
  driver_attendance_shifts: DriverAttendanceShiftsTable;
  accounts: AccountsTable;
  journal_entries: JournalEntriesTable;
  journal_entry_lines: JournalEntryLinesTable;
  accounting_periods: AccountingPeriodsTable;
  fiscal_year_closings: FiscalYearClosingsTable;
  payment_methods: PaymentMethodsTable;
  payments: PaymentsTable;
  payment_adjustment_requests: PaymentAdjustmentRequestsTable;
  payment_reconciliation_records: PaymentReconciliationRecordsTable;
  employees: EmployeesTable;
  payroll_runs: PayrollRunsTable;
  payroll_run_employees: PayrollRunEmployeesTable;
  employee_leave_requests: EmployeeLeaveRequestsTable;
  employee_attendance_shifts: EmployeeAttendanceShiftsTable;
  payroll_adjustments: PayrollAdjustmentsTable;
  cashier_shifts: CashierShiftsTable;
  cash_drawer_entries: CashDrawerEntriesTable;
  treasuries: TreasuriesTable;
  banks: BanksTable;
  bank_accounts: BankAccountsTable;
  printers: PrintersTable;
  kitchen_stations: KitchenStationsTable;
  print_jobs: PrintJobsTable;
  pos_settings: PosSettingsTable;
  branch_days: BranchDaysTable;
  branch_stock_thresholds: BranchStockThresholdsTable;
  transfer_requests: TransferRequestsTable;
  transfer_request_lines: TransferRequestLinesTable;
  expense_categories: ExpenseCategoriesTable;
  expenses: ExpensesTable;
  purchases: PurchasesTable;
  purchase_lines: PurchaseLinesTable;
}
