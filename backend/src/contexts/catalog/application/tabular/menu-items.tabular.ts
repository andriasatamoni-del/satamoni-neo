import { Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../../shared/domain/domain-error";
import { normalizeForMatching } from "../../../../shared/tabular/sheet/text-matching";
import {
  rowCreated,
  rowUnchanged,
  rowUpdated,
  type TabularAdapter,
  type TabularContext,
  type TabularImportContext,
  type TabularRowOutcome,
} from "../../../../shared/tabular/tabular-adapter";
import type { MenuItem, MenuItemKind } from "../../domain/menu-item.aggregate";
import { MENU_CATEGORY_REPOSITORY, type MenuCategoryRepositoryPort } from "../../domain/ports/menu-category-repository.port";
import { MENU_ITEM_REPOSITORY, type MenuItemListFilter, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { AddVariantHandler } from "../commands/add-variant.handler";
import { RegisterMenuItemHandler } from "../commands/register-menu-item.handler";
import { UpdateMenuItemHandler } from "../commands/update-menu-item.handler";
import { UpdateVariantHandler } from "../commands/update-variant.handler";
import { ADDON_VARIANT_LABEL, MENU_ITEM_SHEET, menuItemSheetRows, type MenuItemSheetRow } from "./menu-item.sheet";

export interface MenuItemExportFilter {
  q?: string;
  kind?: MenuItemKind | "all";
  categoryId?: string;
  status?: "active" | "inactive";
}

interface MenuImportState {
  categoryIdByName: Map<string, string>;
  itemsByName: Map<string, MenuItem[]>;
  createdItemIds: Set<string>;
}

class MenuImportRowError extends DomainError {
  readonly httpStatus = 400;
}

interface SizeInput {
  label: string;
  price: number;
  talabatPrice: number;
}

@Injectable()
export class MenuItemsTabular implements TabularAdapter<typeof MENU_ITEM_SHEET, MenuItemExportFilter, MenuImportState> {
  readonly sheet = MENU_ITEM_SHEET;

  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    @Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort,
    private readonly registerItem: RegisterMenuItemHandler,
    private readonly updateItem: UpdateMenuItemHandler,
    private readonly addVariant: AddVariantHandler,
    private readonly updateVariant: UpdateVariantHandler
  ) {}

  async exportRows({ kind = "all", ...filter }: MenuItemExportFilter): Promise<MenuItemSheetRow[]> {
    const searchFilter: MenuItemListFilter = { ...filter, kind: kind === "all" ? undefined : kind };
    const [{ items }, categories] = await Promise.all([this.items.search(searchFilter), this.categories.list()]);
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    return items.flatMap((item) => menuItemSheetRows(item, item.categoryId ? categoryNames.get(item.categoryId) ?? null : null));
  }

  async prepare(_rows: MenuItemSheetRow[], _context: TabularContext): Promise<MenuImportState> {
    const [categories, items] = await Promise.all([this.categories.list(), this.items.list()]);
    const itemsByName = new Map<string, MenuItem[]>();
    for (const item of items) {
      const key = normalizeForMatching(item.name);
      itemsByName.set(key, [...(itemsByName.get(key) ?? []), item]);
    }
    return {
      categoryIdByName: new Map(categories.map((category) => [normalizeForMatching(category.name), category.id])),
      itemsByName,
      createdItemIds: new Set(),
    };
  }

  async importRow(row: MenuItemSheetRow, context: TabularImportContext<MenuImportState>): Promise<TabularRowOutcome> {
    const state = context.prepared;
    const kind: MenuItemKind = row.kind ?? "item";
    const categoryId = this.categoryIdOf(row, kind, state);
    const size = sizeOf(row, kind);
    const nameKey = normalizeForMatching(row.name);
    const matches = state.itemsByName.get(nameKey) ?? [];
    if (matches.length > 1) throw new MenuImportRowError(`فيه أكتر من صنف اسمه "${row.name.trim()}" - غيّر اسم واحد منهم الأول`);

    const existing = matches[0];
    if (!existing) {
      const item = await this.registerItem.execute({
        kind,
        name: row.name,
        categoryId: kind === "addon" ? undefined : categoryId,
        description: row.description?.trim() || null,
        variants: size ? [size] : undefined,
      });
      if (row.isActive === false) await this.updateItem.execute({ itemId: item.id, isActive: false });
      const saved = (await this.items.findById(item.id)) ?? item;
      state.itemsByName.set(nameKey, [saved]);
      state.createdItemIds.add(saved.id);
      return rowCreated(saved.id);
    }

    if (existing.kind !== kind) throw new MenuImportRowError(`"${existing.name}" مسجّل ${existing.isAddon ? "إضافة" : "صنف"} - النوع مش بيتغيّر`);

    const detailsChanged = await this.applyDetails(existing, row, kind, categoryId);
    const sizeChanged = size ? await this.applySize(existing, size, context.user.id) : false;
    const refreshed = detailsChanged || sizeChanged ? await this.items.findById(existing.id) : existing;
    if (refreshed) state.itemsByName.set(nameKey, [refreshed]);

    if (state.createdItemIds.has(existing.id)) return rowCreated(existing.id);
    return detailsChanged || sizeChanged ? rowUpdated(existing.id) : rowUnchanged(existing.id);
  }

  private categoryIdOf(row: MenuItemSheetRow, kind: MenuItemKind, state: MenuImportState): string | null | undefined {
    const name = row.category?.trim();
    if (kind === "addon") {
      if (name) throw new MenuImportRowError("الإضافة مالهاش قسم - سيب خانة القسم فاضية");
      return undefined;
    }
    if (row.category === undefined) return undefined;
    if (!name) return null;
    const id = state.categoryIdByName.get(normalizeForMatching(name));
    if (!id) throw new MenuImportRowError(`القسم "${name}" مش موجود - ضيفه من تبويب الأقسام الأول`);
    return id;
  }

  private async applyDetails(item: MenuItem, row: MenuItemSheetRow, kind: MenuItemKind, categoryId: string | null | undefined): Promise<boolean> {
    const description = row.description === undefined ? undefined : row.description?.trim() || null;
    const patch = {
      categoryId: kind === "item" && categoryId !== undefined && categoryId !== item.categoryId ? categoryId : undefined,
      description: description !== undefined && description !== item.description ? description : undefined,
      isActive: row.isActive !== undefined && row.isActive !== null && row.isActive !== item.isActive ? row.isActive : undefined,
    };
    if (patch.categoryId === undefined && patch.description === undefined && patch.isActive === undefined) return false;
    await this.updateItem.execute({ itemId: item.id, ...patch });
    return true;
  }

  private async applySize(item: MenuItem, size: SizeInput, changedBy: string): Promise<boolean> {
    const variant = item.isAddon
      ? item.variants[0]
      : item.variants.find((v) => normalizeForMatching(v.label) === normalizeForMatching(size.label));
    if (!variant) {
      await this.addVariant.execute({ itemId: item.id, ...size });
      return true;
    }
    const price = Number(variant.price) !== size.price ? size.price : undefined;
    const talabatPrice = Number(variant.talabatPrice) !== size.talabatPrice ? size.talabatPrice : undefined;
    if (price === undefined && talabatPrice === undefined) return false;
    await this.updateVariant.execute({ itemId: item.id, variantId: variant.id, price, talabatPrice, changedBy });
    return true;
  }
}

function sizeOf(row: MenuItemSheetRow, kind: MenuItemKind): SizeInput | null {
  const label = kind === "addon" ? ADDON_VARIANT_LABEL : row.size?.trim() ?? "";
  const hasPrice = row.price !== undefined && row.price !== null;
  const hasTalabatPrice = row.talabatPrice !== undefined && row.talabatPrice !== null;
  if (kind === "item" && !label) {
    if (hasPrice || hasTalabatPrice) throw new MenuImportRowError("اكتب اسم الحجم للسعر ده");
    return null;
  }
  if (kind === "addon" && !hasPrice && !hasTalabatPrice) return null;
  if (!hasPrice || !hasTalabatPrice) throw new MenuImportRowError(`السعر وسعر طلبات مطلوبين للحجم "${label}"`);
  return { label, price: row.price as number, talabatPrice: row.talabatPrice as number };
}
