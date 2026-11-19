import { PERMISSION } from "../shared/auth/permissions";
import { PageHeader } from "../shared/ui/PageHeader";
import { Tabs, usePermittedTabs } from "../shared/ui/Tabs";
import { BranchStockTab } from "./inventory/BranchStockTab";
import { ItemsTab } from "./inventory/ItemsTab";
import { TransfersTab } from "./inventory/TransfersTab";

const TABS = [
  { key: "stock", label: "رصيد الفرع", perm: [PERMISSION.INVENTORY_ITEMS_VIEW, PERMISSION.INVENTORY_ITEMS_MANAGE] },
  { key: "items", label: "الأصناف", perm: [PERMISSION.INVENTORY_ITEMS_VIEW, PERMISSION.INVENTORY_ITEMS_MANAGE] },
  {
    key: "transfers",
    label: "التحويل بين الفروع",
    perm: [PERMISSION.INVENTORY_TRANSFERS_REGISTER, PERMISSION.INVENTORY_ITEMS_VIEW, PERMISSION.INVENTORY_MOVEMENTS_RECORD],
  },
] as const;

export function InventoryPage() {
  const { tabs, active: tab, setActive: setTab } = usePermittedTabs(TABS);

  return (
    <div>
      <PageHeader title="المخزون" description="رصيد الأصناف في كل فرع، الأصناف، والتحويل بين الفروع" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "stock" && <BranchStockTab />}
      {tab === "items" && <ItemsTab />}
      {tab === "transfers" && <TransfersTab />}
    </div>
  );
}
