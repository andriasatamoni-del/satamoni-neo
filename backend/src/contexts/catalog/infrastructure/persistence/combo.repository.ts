import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Combo } from "../../domain/combo.aggregate";
import type { ComboRepositoryPort } from "../../domain/ports/combo-repository.port";
import { comboItems, combos } from "./catalog.tables";

@Injectable()
export class ComboRepository implements ComboRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(combo: Combo): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(combos)
        .values({
          id: combo.id,
          name: combo.name,
          price: combo.price,
          is_active: combo.isActive,
          image_url: combo.imageUrl,
          description: combo.description,
          online_only: combo.onlineOnly,
          legacy_combo_id: combo.legacyComboId,
          created_at: combo.createdAt,
        })
        .onConflictDoUpdate({
          target: combos.id,
          set: {
            name: combo.name,
            price: combo.price,
            is_active: combo.isActive,
            image_url: combo.imageUrl,
            description: combo.description,
            online_only: combo.onlineOnly,
          },
        });

      await tx.delete(comboItems).where(eq(comboItems.combo_id, combo.id));
      for (const item of combo.items) {
        await tx.insert(comboItems).values({ id: item.id, combo_id: combo.id, variant_id: item.variantId, quantity: item.quantity });
      }
    });
  }

  async findById(id: string): Promise<Combo | null> {
    const [row] = await this.db.select().from(combos).where(eq(combos.id, id)).limit(1);
    return row ? this.toDomain(row, await this.loadItems(id)) : null;
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: combos.id })
      .from(combos)
      .where(and(eq(combos.name, name), excludeId ? ne(combos.id, excludeId) : undefined))
      .limit(1);
    return !!row;
  }

  async list(filter?: { activeOnly?: boolean }): Promise<Combo[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { activeOnly?: boolean }, page?: PageRequest): Promise<{ rows: Combo[]; total: number }> {
    const where = filter?.activeOnly ? eq(combos.is_active, true) : undefined;
    const query = this.db.select().from(combos).where(where).orderBy(asc(combos.name), desc(combos.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(combos).where(where)));
    const result: Combo[] = [];
    for (const row of rows) result.push(this.toDomain(row, await this.loadItems(row.id)));
    return { rows: result, total };
  }

  private loadItems(comboId: string): Promise<(typeof comboItems.$inferSelect)[]> {
    return this.db.select().from(comboItems).where(eq(comboItems.combo_id, comboId));
  }

  private toDomain(row: typeof combos.$inferSelect, itemRows: (typeof comboItems.$inferSelect)[]): Combo {
    return Combo.reconstitute(row.id, {
      name: row.name,
      price: Number(row.price),
      isActive: row.is_active,
      imageUrl: row.image_url,
      description: row.description,
      onlineOnly: row.online_only,
      items: itemRows.map((i) => ({ id: i.id, variantId: i.variant_id, quantity: i.quantity })),
      legacyComboId: row.legacy_combo_id,
      createdAt: row.created_at,
    });
  }
}
