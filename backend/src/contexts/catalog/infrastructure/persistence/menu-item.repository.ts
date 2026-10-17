import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { MenuItem } from "../../domain/menu-item.aggregate";
import type { MenuItemListFilter, MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { businessDayRangeCondition, groupBy, inListChunks, orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { menuItemModifiers, menuItemModifierVariantPrices, menuItems, menuItemVariants } from "./catalog.tables";

type ModifierWithPrices = {
  row: typeof menuItemModifiers.$inferSelect;
  variantPrices: (typeof menuItemModifierVariantPrices.$inferSelect)[];
};

@Injectable()
export class MenuItemRepository implements MenuItemRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // بيسجّل الصنف وكل أحجامه (variants) في معاملة واحدة - الأحجام entities تابعة لنفس الـaggregate
  // (راجع تعليق MenuItem)، مش aggregate منفصل بيتسجّل لوحده
  async save(item: MenuItem): Promise<void> {
    await this.db.transaction(async (tx) => {
      const itemRow = {
        id: item.id,
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

      for (const modifier of item.modifiers) {
        await tx
          .insert(menuItemModifiers)
          .values({
            id: modifier.id,
            item_id: item.id,
            name: modifier.name,
            price_delta: modifier.priceDelta,
            is_active: modifier.isActive,
            legacy_modifier_id: modifier.legacyModifierId,
          })
          .onConflictDoUpdate({
            target: menuItemModifiers.id,
            set: { name: modifier.name, price_delta: modifier.priceDelta, is_active: modifier.isActive },
          });

        // مزامنة كاملة لأسعار الأحجام المخصوصة للمرفق ده - بيمسح أي حجم متشال من قايمة الـaggregate
        // في الذاكرة (clearModifierVariantPrice) وبيحدّث/يضيف الموجودين، في خطوة واحدة بدل ما نحتاج
        // نتتبّع إيه اتغيّر بالظبط
        const variantIds = modifier.variantPrices.map((vp) => vp.variantId);
        await tx
          .delete(menuItemModifierVariantPrices)
          .where(
            and(
              eq(menuItemModifierVariantPrices.modifier_id, modifier.id),
              variantIds.length > 0 ? notInArray(menuItemModifierVariantPrices.variant_id, variantIds) : undefined
            )
          );

        for (const vp of modifier.variantPrices) {
          await tx
            .insert(menuItemModifierVariantPrices)
            .values({ modifier_id: modifier.id, variant_id: vp.variantId, price_delta: vp.priceDelta })
            .onConflictDoUpdate({
              target: [menuItemModifierVariantPrices.modifier_id, menuItemModifierVariantPrices.variant_id],
              set: { price_delta: vp.priceDelta },
            });
        }
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

  async list(): Promise<MenuItem[]> {
    return this.withChildren(await this.db.select().from(menuItems).orderBy(asc(menuItems.name)));
  }

  async search(filter: MenuItemListFilter, page?: PageRequest): Promise<{ items: MenuItem[]; total: number }> {
    const where = and(
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

  // NEO-6: variants, modifiers and modifier prices of many items in three batched queries instead of one per item/modifier
  private async withChildren(rows: (typeof menuItems.$inferSelect)[]): Promise<MenuItem[]> {
    if (rows.length === 0) return [];
    const variantRows: (typeof menuItemVariants.$inferSelect)[] = [];
    const modifierRows: (typeof menuItemModifiers.$inferSelect)[] = [];
    for (const ids of inListChunks(rows.map((r) => r.id))) {
      variantRows.push(...(await this.db.select().from(menuItemVariants).where(inArray(menuItemVariants.item_id, ids)).orderBy(asc(menuItemVariants.label))));
      modifierRows.push(...(await this.db.select().from(menuItemModifiers).where(inArray(menuItemModifiers.item_id, ids)).orderBy(asc(menuItemModifiers.name))));
    }
    const priceRows: (typeof menuItemModifierVariantPrices.$inferSelect)[] = [];
    for (const ids of inListChunks(modifierRows.map((m) => m.id))) {
      priceRows.push(...(await this.db.select().from(menuItemModifierVariantPrices).where(inArray(menuItemModifierVariantPrices.modifier_id, ids))));
    }
    const variantsByItem = groupBy(variantRows, (v) => v.item_id);
    const modifiersByItem = groupBy(modifierRows, (m) => m.item_id);
    const pricesByModifier = groupBy(priceRows, (p) => p.modifier_id);
    return rows.map((row) =>
      this.toDomain(
        row,
        variantsByItem.get(row.id) ?? [],
        (modifiersByItem.get(row.id) ?? []).map((m) => ({ row: m, variantPrices: pricesByModifier.get(m.id) ?? [] }))
      )
    );
  }

  private toDomain(
    row: typeof menuItems.$inferSelect,
    variantRows: (typeof menuItemVariants.$inferSelect)[],
    modifierRows: ModifierWithPrices[]
  ): MenuItem {
    return MenuItem.reconstitute(row.id, {
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
        talabatPrice: v.talabat_price != null ? Number(v.talabat_price) : null,
        legacyVariantId: v.legacy_variant_id,
      })),
      modifiers: modifierRows.map(({ row: m, variantPrices }) => ({
        id: m.id,
        name: m.name,
        priceDelta: Number(m.price_delta),
        isActive: m.is_active,
        legacyModifierId: m.legacy_modifier_id,
        variantPrices: variantPrices.map((vp) => ({ variantId: vp.variant_id, priceDelta: Number(vp.price_delta) })),
      })),
    });
  }
}
