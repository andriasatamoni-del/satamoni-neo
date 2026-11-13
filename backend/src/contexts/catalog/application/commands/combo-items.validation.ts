import type { ComboItemInput } from "../../domain/combo.aggregate";
import { AddonNotAllowedInComboError, ComboAddonMustBeAddonError, InvalidComboItemError } from "../../domain/errors";
import type { MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";

export async function assertValidComboItems(menuItems: MenuItemRepositoryPort, items: ComboItemInput[]): Promise<void> {
  for (const item of items) {
    const menuItem = await menuItems.findByVariantId(item.variantId);
    if (!menuItem) throw new InvalidComboItemError();
    if (menuItem.isAddon) throw new AddonNotAllowedInComboError();
    for (const addon of item.addons ?? []) {
      const addonItem = await menuItems.findByVariantId(addon.variantId);
      if (!addonItem) throw new InvalidComboItemError();
      if (!addonItem.isAddon) throw new ComboAddonMustBeAddonError();
    }
  }
}
