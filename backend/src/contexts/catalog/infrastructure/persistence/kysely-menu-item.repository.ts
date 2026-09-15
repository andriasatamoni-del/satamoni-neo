import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { MenuItem } from "../../domain/menu-item.aggregate";
import type { MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import type { MenuItemsTable, MenuItemVariantsTable } from "./catalog.schema";

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
    });
  }

  async findById(id: string): Promise<MenuItem | null> {
    const row = await this.db.selectFrom("menu_items").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadVariants(id));
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
    return this.toDomain(row, await this.loadVariants(row.id));
  }

  async list(): Promise<MenuItem[]> {
    const rows = await this.db.selectFrom("menu_items").selectAll().orderBy("name").execute();
    const items: MenuItem[] = [];
    for (const row of rows) {
      items.push(this.toDomain(row, await this.loadVariants(row.id)));
    }
    return items;
  }

  private async loadVariants(itemId: string): Promise<Selectable<MenuItemVariantsTable>[]> {
    return this.db.selectFrom("menu_item_variants").selectAll().where("item_id", "=", itemId).orderBy("label").execute();
  }

  private toDomain(row: Selectable<MenuItemsTable>, variantRows: Selectable<MenuItemVariantsTable>[]): MenuItem {
    return MenuItem.reconstitute(row.id, {
      categoryId: row.category_id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      isBest: row.is_best,
      isActive: row.is_active,
      legacyMenuItemId: row.legacy_menu_item_id,
      createdAt: row.created_at,
      variants: variantRows.map((v) => ({
        id: v.id,
        label: v.label,
        price: Number(v.price),
        talabatPrice: v.talabat_price != null ? Number(v.talabat_price) : null,
        legacyVariantId: v.legacy_variant_id,
      })),
    });
  }
}
