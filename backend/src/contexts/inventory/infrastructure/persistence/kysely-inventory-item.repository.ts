import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { InventoryItem, type ItemType, type NegativeStockPolicy } from "../../domain/inventory-item.aggregate";
import type { InventoryItemRepositoryPort } from "../../domain/ports/inventory-item-repository.port";
import type { InventoryItemsTable } from "./inventory-item.schema";

@Injectable()
export class KyselyInventoryItemRepository implements InventoryItemRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(item: InventoryItem): Promise<void> {
    const row = this.toRow(item);
    await this.db
      .insertInto("inventory_items")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          unit: row.unit,
          unit_cost: row.unit_cost,
          item_type: row.item_type,
          negative_stock_policy: row.negative_stock_policy,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<InventoryItem | null> {
    const row = await this.db.selectFrom("inventory_items").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByName(name: string): Promise<InventoryItem | null> {
    const row = await this.db.selectFrom("inventory_items").selectAll().where("name", "=", name.trim()).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async existsByName(name: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("inventory_items")
      .select("id")
      .where("name", "=", name.trim())
      .executeTakeFirst();
    return !!row;
  }

  async findByLegacyInventoryItemId(legacyId: number): Promise<InventoryItem | null> {
    const row = await this.db
      .selectFrom("inventory_items")
      .selectAll()
      .where("legacy_inventory_item_id", "=", legacyId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<InventoryItem[]> {
    const rows = await this.db.selectFrom("inventory_items").selectAll().orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(item: InventoryItem) {
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      unit_cost: item.unitCost,
      item_type: item.itemType,
      negative_stock_policy: item.negativeStockPolicy,
      legacy_inventory_item_id: item.legacyInventoryItemId,
      created_at: item.createdAt,
    };
  }

  private toDomain(row: Selectable<InventoryItemsTable>): InventoryItem {
    return InventoryItem.reconstitute(row.id, {
      name: row.name,
      unit: row.unit,
      unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
      itemType: row.item_type as ItemType,
      negativeStockPolicy: row.negative_stock_policy as NegativeStockPolicy,
      legacyInventoryItemId: row.legacy_inventory_item_id,
      createdAt: row.created_at,
    });
  }
}
