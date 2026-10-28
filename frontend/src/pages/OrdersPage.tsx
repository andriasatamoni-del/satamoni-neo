import { useState, type FormEvent } from "react";
import { useAuth } from "../shared/auth/AuthContext";
import { PERMISSION } from "../shared/auth/permissions";
import { can } from "../shared/auth/roles";
import { PageHeader } from "../shared/ui/PageHeader";
import { Field, Select } from "../shared/ui/Field";
import { ShiftBanner } from "./orders/ShiftBanner";
import { ShiftReviewPanel } from "./orders/ShiftReviewPanel";
import { OfflineSyncBanner } from "./orders/OfflineSyncBanner";
import { MenuBrowser } from "./orders/MenuBrowser";
import { CartPanel } from "./orders/CartPanel";
import { ItemPickerDialog } from "./orders/ItemPickerDialog";
import { OrdersListCard, useOrdersListState } from "./orders/OrdersListCard";
import { needsOptionPicker } from "./orders/menuPricing";
import { useOrderDraft } from "./orders/orderDraft";
import { useCart } from "./orders/useCart";
import { useCreateOrder } from "./orders/useCreateOrder";
import { errorMessage } from "../shared/api/errorMessage";
import { usePosBranches } from "./orders/usePosBranches";
import { usePosCatalog } from "./orders/usePosCatalog";
import type { MenuItem } from "./orders/posTypes";

export function OrdersPage() {
  const { user } = useAuth();
  const canCreateOrders = can(user, PERMISSION.ORDERS_CREATE);
  const canManageOrders = can(user, PERMISSION.ORDERS_MANAGE);
  const canSeeCatalog = can(user, PERMISSION.CATALOG_ITEMS_VIEW, PERMISSION.CATALOG_ITEMS_MANAGE);
  const canSeePaymentMethods = can(user, PERMISSION.PAYMENT_CONTROL_VIEW);

  const { branches, canListBranches, defaultBranchId } = usePosBranches();
  const [branchId, setBranchId] = useState(defaultBranchId);
  const ordersList = useOrdersListState();
  const catalog = usePosCatalog(canSeeCatalog);

  const cart = useCart();
  const orderDraft = useOrderDraft();
  const createOrder = useCreateOrder(() => {
    cart.clear();
    orderDraft.resetKeepingOrderType();
  });
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);

  function handleItemClick(item: MenuItem) {
    if (item.variants.length === 0) return;
    if (needsOptionPicker(item)) setPickerItem(item);
    else cart.addItem(item, item.variants[0], []);
  }

  function handleBranchChange(id: string) {
    setBranchId(id);
    ordersList.setPage(1);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createOrder.mutate({ branchId, draft: orderDraft.draft, lines: cart.lines });
  }

  return (
    <div>
      <PageHeader title="الطلبات (POS)" description="تسجيل ومتابعة طلبات البيع" />

      <ShiftBanner />
      <ShiftReviewPanel />
      <OfflineSyncBanner />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="الفرع">
          <Select value={branchId} onChange={(e) => handleBranchChange(e.target.value)} className="max-w-[220px]">
            {canListBranches && <option value="">كل الفروع</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      </div>

      {canCreateOrders && (
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
            <MenuBrowser catalog={catalog} cart={cart} onItemClick={handleItemClick} onComboClick={cart.addCombo} />
            <CartPanel
              cart={cart}
              draft={orderDraft.draft}
              onDraftChange={orderDraft.update}
              canChoosePaymentMethod={canSeePaymentMethods}
              branchSelected={branchId !== ""}
              isSubmitting={createOrder.isPending}
              error={errorMessage(createOrder.error)}
            />
          </div>
        </form>
      )}

      {pickerItem && (
        <ItemPickerDialog
          key={pickerItem.id}
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onAdd={(variant, modifierIds) => {
            cart.addItem(pickerItem, variant, modifierIds);
            setPickerItem(null);
          }}
        />
      )}

      <OrdersListCard
        listState={ordersList}
        branchId={branchId}
        canManageOrders={canManageOrders}
        describeOrderLine={catalog.describeOrderLine}
      />
    </div>
  );
}
