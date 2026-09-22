import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { MenuItem } from "../../domain/menu-item.aggregate";
import type { MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import type {
  MenuItemsTable,
  MenuItemVariantsTable,
  MenuItemModifiersTable,
  MenuItemModifierVariantPricesTable,
} from "./catalog.schema";

@Injectable()
export class KyselyMenuItemRepository implements MenuItemRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  // بيسجّل الصنف وكل أحجامه (variants) في معاملة واحدة - الأحجام entities تابعة لنفس الـaggregate
  // (راجع تعليق MenuItem)، مش aggregate منفصل بيتسجّل لوحده
  async save(item: MenuItem): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
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
      await trx
        .insertInto("menu_items")
        .values(itemRow)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            category_id: itemRow.category_id,
            name: itemRow.name,
            description: itemRow.description,
            image_url: itemRow.image_url,
            is_best: itemRow.is_best,
            is_active: itemRow.is_active,
            station_id: itemRow.station_id,
          })
        )
        .execute();

      for (const variant of item.variants) {
        await trx
          .insertInto("menu_item_variants")
          .values({
            id: variant.id,
            item_id: item.id,
            label: variant.label,
            price: variant.price,
            talabat_price: variant.talabatPrice,
            legacy_variant_id: variant.legacyVariantId,
          })
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({ label: variant.label, price: variant.price, talabat_price: variant.talabatPrice })
          )
          .execute();
      }

      for (const modifier of item.modifiers) {
        await trx
          .insertInto("menu_item_modifiers")
          .values({
            id: modifier.id,
            item_id: item.id,
            name: modifier.name,
            price_delta: modifier.priceDelta,
            is_active: modifier.isActive,
            legacy_modifier_id: modifier.legacyModifierId,
          })
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({ name: modifier.name, price_delta: modifier.priceDelta, is_active: modifier.isActive })
          )
          .execute();

        // مزامنة كاملة لأسعار الأحجام المخصوصة للمرفق ده - بيمسح أي حجم متشال من قايمة الـaggregate
        // في الذاكرة (clearModifierVariantPrice) وبيحدّث/يضيف الموجودين، في خطوة واحدة بدل ما نحتاج
        // نتتبّع إيه اتغيّر بالظبط
        const variantIds = modifier.variantPrices.map((vp) => vp.variantId);
        let deleteQuery = trx.deleteFrom("menu_item_modifier_variant_prices").where("modifier_id", "=", modifier.id);
        if (variantIds.length > 0) deleteQuery = deleteQuery.where("variant_id", "not in", variantIds);
        await deleteQuery.execute();

        for (const vp of modifier.variantPrices) {
          await trx
            .insertInto("menu_item_modifier_variant_prices")
            .values({ modifier_id: modifier.id, variant_id: vp.variantId, price_delta: vp.priceDelta })
            .onConflict((oc) => oc.columns(["modifier_id", "variant_id"]).doUpdateSet({ price_delta: vp.priceDelta }))
            .execute();
        }
      }
    });
  }

  async findById(id: string): Promise<MenuItem | null> {
    const row = await this.db.selectFrom("menu_items").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadVariants(id), await this.loadModifiers(id));
  }

  async findByVariantId(variantId: string): Promise<MenuItem | null> {
    const variantRow = await this.db
      .selectFrom("menu_item_variants")
      .select("item_id")
      .where("id", "=", variantId)
      .executeTakeFirst();
    return variantRow ? this.findById(variantRow.item_id) : null;
  }

  async findByLegacyMenuItemId(legacyId: number): Promise<MenuItem | null> {
    const row = await this.db
      .selectFrom("menu_items")
      .selectAll()
      .where("legacy_menu_item_id", "=", legacyId)
      .executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadVariants(row.id), await this.loadModifiers(row.id));
  }

  async list(): Promise<MenuItem[]> {
    const rows = await this.db.selectFrom("menu_items").selectAll().orderBy("name").execute();
    const items: MenuItem[] = [];
    for (const row of rows) {
      items.push(this.toDomain(row, await this.loadVariants(row.id), await this.loadModifiers(row.id)));
    }
    return items;
  }

  private async loadVariants(itemId: string): Promise<Selectable<MenuItemVariantsTable>[]> {
    return this.db.selectFrom("menu_item_variants").selectAll().where("item_id", "=", itemId).orderBy("label").execute();
  }

  private async loadModifiers(
    itemId: string
  ): Promise<{ row: Selectable<MenuItemModifiersTable>; variantPrices: Selectable<MenuItemModifierVariantPricesTable>[] }[]> {
    const modifierRows = await this.db
      .selectFrom("menu_item_modifiers")
      .selectAll()
      .where("item_id", "=", itemId)
      .orderBy("name")
      .execute();
    const result: { row: Selectable<MenuItemModifiersTable>; variantPrices: Selectable<MenuItemModifierVariantPricesTable>[] }[] = [];
    for (const row of modifierRows) {
      const variantPrices = await this.db
        .selectFrom("menu_item_modifier_variant_prices")
        .selectAll()
        .where("modifier_id", "=", row.id)
        .execute();
      result.push({ row, variantPrices });
    }
    return result;
  }

  private toDomain(
    row: Selectable<MenuItemsTable>,
    variantRows: Selectable<MenuItemVariantsTable>[],
    modifierRows: { row: Selectable<MenuItemModifiersTable>; variantPrices: Selectable<MenuItemModifierVariantPricesTable>[] }[]
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
