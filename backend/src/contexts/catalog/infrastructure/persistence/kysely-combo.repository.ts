import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Combo } from "../../domain/combo.aggregate";
import type { ComboRepositoryPort } from "../../domain/ports/combo-repository.port";
import type { CombosTable, ComboItemsTable } from "./catalog.schema";

@Injectable()
export class KyselyComboRepository implements ComboRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(combo: Combo): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("combos")
        .values({
          id: combo.id,
          name: combo.name,
          price: combo.price,
          is_active: combo.isActive,
          legacy_combo_id: combo.legacyComboId,
          created_at: combo.createdAt,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            name: combo.name,
            price: combo.price,
            is_active: combo.isActive,
          })
        )
        .execute();

      await trx.deleteFrom("combo_items").where("combo_id", "=", combo.id).execute();
      for (const item of combo.items) {
        await trx
          .insertInto("combo_items")
          .values({ id: item.id, combo_id: combo.id, variant_id: item.variantId, quantity: item.quantity })
          .execute();
      }
    });
  }

  async findById(id: string): Promise<Combo | null> {
    const row = await this.db.selectFrom("combos").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row, await this.loadItems(id)) : null;
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    let query = this.db.selectFrom("combos").select("id").where("name", "=", name);
    if (excludeId) query = query.where("id", "!=", excludeId);
    return !!(await query.executeTakeFirst());
  }

  async list(filter?: { activeOnly?: boolean }): Promise<Combo[]> {
    let query = this.db.selectFrom("combos").selectAll();
    if (filter?.activeOnly) query = query.where("is_active", "=", true);
    const rows = await query.orderBy("name").execute();
    const combos: Combo[] = [];
    for (const row of rows) combos.push(this.toDomain(row, await this.loadItems(row.id)));
    return combos;
  }

  private loadItems(comboId: string): Promise<Selectable<ComboItemsTable>[]> {
    return this.db.selectFrom("combo_items").selectAll().where("combo_id", "=", comboId).execute();
  }

  private toDomain(row: Selectable<CombosTable>, itemRows: Selectable<ComboItemsTable>[]): Combo {
    return Combo.reconstitute(row.id, {
      name: row.name,
      price: Number(row.price),
      isActive: row.is_active,
      items: itemRows.map((i) => ({ id: i.id, variantId: i.variant_id, quantity: i.quantity })),
      legacyComboId: row.legacy_combo_id,
      createdAt: row.created_at,
    });
  }
}
