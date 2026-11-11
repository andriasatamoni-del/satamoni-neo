import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { MenuItem, type MenuItemKind } from "../../domain/menu-item.aggregate";
import type { MenuItemListFilter, MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { businessDayRangeCondition, groupBy, inListChunks, orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { menuItems, menuItemVariants } from "./catalog.tables";

@Injectable()
export class MenuItemRepository implements MenuItemRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(item: MenuItem): Promise<void> {
    await this.db.transaction(async (tx) => {
      const itemRow = {
        id: item.id,
        kind: item.kind,
        category_id: item.categoryId,
        name: item.name,
        description: item.description,
        image_url: item.imageUrl,
        is_best: item.isBest,
        is_active: item.isActive,
        legacy_menu_item_id: item.legacyMenuItemId,
        created_at: item.createdAt,
        station_id: item.stationId,
      };
      await tx
        .insert(menuItems)
        .values(itemRow)
        .onConflictDoUpdate({
          target: menuItems.id,
          set: {
            category_id: itemRow.category_id,
            name: itemRow.name,
            description: itemRow.description,
            image_url: itemRow.image_url,
            is_best: itemRow.is_best,
            is_active: itemRow.is_active,
            station_id: itemRow.station_id,
          },
        });

      for (const variant of item.variants) {
        await tx
          .insert(menuItemVariants)
          .values({
            id: variant.id,
            item_id: item.id,
            label: variant.label,
            price: variant.price,
            talabat_price: variant.talabatPrice,
            legacy_variant_id: variant.legacyVariantId,
          })
          .onConflictDoUpdate({
            target: menuItemVariants.id,
            set: { label: variant.label, price: variant.price, talabat_price: variant.talabatPrice },
          });
      }
    });
  }

  async findById(id: string): Promise<MenuItem | null> {
    const [row] = await this.db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
    return row ? (await this.withChildren([row]))[0] : null;
  }

  async findByVariantId(variantId: string): Promise<MenuItem | null> {
    const [variantRow] = await this.db
      .select({ item_id: menuItemVariants.item_id })
      .from(menuItemVariants)
      .where(eq(menuItemVariants.id, variantId))
      .limit(1);
    return variantRow ? this.findById(variantRow.item_id) : null;
  }

  async findByLegacyMenuItemId(legacyId: number): Promise<MenuItem | null> {
    const [row] = await this.db.select().from(menuItems).where(eq(menuItems.legacy_menu_item_id, legacyId)).limit(1);
    return row ? (await this.withChildren([row]))[0] : null;
  }

  async list(kind?: MenuItemKind): Promise<MenuItem[]> {
    return this.withChildren(
      await this.db.select().from(menuItems).where(kind ? eq(menuItems.kind, kind) : undefined).orderBy(asc(menuItems.name))
    );
  }

  async search(filter: MenuItemListFilter, page?: PageRequest): Promise<{ items: MenuItem[]; total: number }> {
    const where = and(
      filter.kind ? eq(menuItems.kind, filter.kind) : undefined,
      filter.categoryId === "none" ? isNull(menuItems.category_id) : filter.categoryId ? eq(menuItems.category_id, filter.categoryId) : undefined,
      filter.status ? eq(menuItems.is_active, filter.status === "active") : undefined,
      filter.isBest !== undefined ? eq(menuItems.is_best, filter.isBest) : undefined,
      businessDayRangeCondition(menuItems.created_at, filter.from, filter.to),
      searchCondition(filter.q, menuItems.name, menuItems.description)
    );
    const query = this.db
      .select()
      .from(menuItems)
      .where(where)
      .orderBy(...orderByOf({ name: menuItems.name, createdAt: menuItems.created_at }, filter.sort, filter.order, { key: "name", order: "asc" }, menuItems.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(menuItems).where(where)));
    return { items: await this.withChildren(rows), total };
  }

  private async withChildren(rows: (typeof menuItems.$inferSelect)[]): Promise<MenuItem[]> {
    if (rows.length === 0) return [];
    const variantRows: (typeof menuItemVariants.$inferSelect)[] = [];
    for (const ids of inListChunks(rows.map((r) => r.id))) {
      variantRows.push(...(await this.db.select().from(menuItemVariants).where(inArray(menuItemVariants.item_id, ids)).orderBy(asc(menuItemVariants.label))));
    }
    const variantsByItem = groupBy(variantRows, (v) => v.item_id);
    return rows.map((row) => this.toDomain(row, variantsByItem.get(row.id) ?? []));
  }

  private toDomain(row: typeof menuItems.$inferSelect, variantRows: (typeof menuItemVariants.$inferSelect)[]): MenuItem {
    return MenuItem.reconstitute(row.id, {
      kind: row.kind,
      categoryId: row.category_id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      isBest: row.is_best,
      isActive: row.is_active,
      legacyMenuItemId: row.legacy_menu_item_id,
      createdAt: row.created_at,
      stationId: row.station_id,
      variants: variantRows.map((v) => ({
        id: v.id,
        label: v.label,
        price: Number(v.price),
        talabatPrice: Number(v.talabat_price),
        legacyVariantId: v.legacy_variant_id,
      })),
    });
  }
}
