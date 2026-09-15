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

export interface Database {
  users: UsersTable;
  event_outbox: EventOutboxTable;
  customer_followups: CustomerFollowupsTable;
  complaints: ComplaintsTable;
  branches: BranchesTable;
  inventory_items: InventoryItemsTable;
  stock_movements: StockMovementsTable;
  branch_stock_balances: BranchStockBalancesTable;
}
