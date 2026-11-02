import { Badge } from "../../shared/ui/Badge";
import { Card, CardBody } from "../../shared/ui/Card";
import { Input } from "../../shared/ui/Field";
import { itemPriceLabel, sellableVariants } from "./menuPricing";
import { MenuTile, MenuTileGrid } from "./MenuTile";
import { PillButton } from "./PillButton";
import { formatPrice, MENU_GROUP_LABELS } from "./posLabels";
import type { Combo, MenuItem, PriceMenu } from "./posTypes";
import type { Cart } from "./useCart";
import { MENU_GROUP_FILTERS, useMenuBrowser } from "./useMenuBrowser";
import type { PosCatalog } from "./usePosCatalog";

export function MenuBrowser({
  catalog,
  cart,
  priceMenu,
  onPriceMenuChange,
  onItemClick,
  onComboClick,
}: {
  catalog: PosCatalog;
  cart: Cart;
  priceMenu: PriceMenu;
  onPriceMenuChange: (priceMenu: PriceMenu) => void;
  onItemClick: (item: MenuItem) => void;
  onComboClick: (combo: Combo) => void;
}) {
  const isTalabat = priceMenu === "talabat";
  const menu = useMenuBrowser(isTalabat ? { ...catalog, combos: [] } : catalog);

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="بحث عن صنف..."
            value={menu.search}
            onChange={(e) => menu.setSearch(e.target.value)}
            className="max-w-[220px]"
          />
          {menu.hasFastingMenu && (
            <div className="flex gap-1">
              {MENU_GROUP_FILTERS.map((group) => (
                <PillButton key={group} active={menu.menuGroup === group} onClick={() => menu.selectMenuGroup(group)} className="px-3 text-xs">
                  {MENU_GROUP_LABELS[group]}
                </PillButton>
              ))}
            </div>
          )}
          <PillButton active={isTalabat} onClick={() => onPriceMenuChange(isTalabat ? "regular" : "talabat")} className="ms-auto px-3 text-xs">
            منيو طلبات
          </PillButton>
        </div>

        {isTalabat && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            الأسعار دي أسعار طلبات. الأصناف اللي مالهاش سعر طلبات مش متاحة، والعروض مخفية.
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
          {menu.tabs.map((tab) => (
            <PillButton key={tab.key} active={!menu.searching && menu.activeTab === tab.key} onClick={() => menu.selectTab(tab.key)} className="px-3.5 text-sm">
              {tab.label}
            </PillButton>
          ))}
          {menu.tabs.length === 0 && (
            <p className="text-sm text-slate-500">مفيش أقسام نشطة. فعّل أو أضف قسم من شاشة "قائمة الطعام".</p>
          )}
        </div>

        {menu.showingCombos && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-slate-500">العروض</p>
            <MenuTileGrid>
              {catalog.combos.map((combo) => (
                <MenuTile
                  key={combo.id}
                  highlighted
                  name={combo.name}
                  priceLabel={formatPrice(combo.price)}
                  badge={<Badge tone="warning" className="mb-0.5">عرض</Badge>}
                  cartQuantity={cart.comboQuantity(combo.id)}
                  onClick={() => onComboClick(combo)}
                />
              ))}
            </MenuTileGrid>
          </div>
        )}

        <MenuTileGrid>
          {menu.visibleItems.map((item) => (
            <MenuTile
              key={item.id}
              name={item.name}
              priceLabel={itemPriceLabel(item, priceMenu)}
              badge={item.isBest && <Badge tone="warning" className="mb-0.5">الأكثر طلبًا</Badge>}
              cartQuantity={cart.itemQuantity(item)}
              disabled={sellableVariants(item, priceMenu).length === 0}
              onClick={() => onItemClick(item)}
            />
          ))}
          {menu.visibleItems.length === 0 && !menu.showingCombos && (
            <p className="col-span-full py-8 text-center text-sm text-slate-400">
              {menu.searching ? "مفيش أصناف مطابقة للبحث" : "مفيش أصناف في القسم ده"}
            </p>
          )}
        </MenuTileGrid>
      </CardBody>
    </Card>
  );
}
