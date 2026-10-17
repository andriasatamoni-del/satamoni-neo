import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { InventoryItem, type ItemType, type NegativeStockPolicy } from "../../domain/inventory-item.aggregate";
import type { InventoryItemListFilter, InventoryItemRepositoryPort } from "../../domain/ports/inventory-item-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { inventoryItems } from "./inventory.tables";

@Injectable()
export class InventoryItemRepository implements InventoryItemRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(item: InventoryItem): Promise<void> {
    const row = this.toRow(item);
    await this.db
      .insert(inventoryItems)
      .values(row)
      .onConflictDoUpdate({
        target: inventoryItems.id,
        set: {
          name: row.name,
          unit: row.unit,
          unit_cost: row.unit_cost,
          item_type: row.item_type,
          negative_stock_policy: row.negative_stock_policy,
        },
      });
  }

  async findById(id: string): Promise<InventoryItem | null> {
    const [row] = await this.db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByName(name: string): Promise<InventoryItem | null> {
    const [row] = await this.db.select().from(inventoryItems).where(eq(inventoryItems.name, name.trim())).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsByName(name: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.name, name.trim()))
      .limit(1);
    return !!row;
  }

  async findByLegacyInventoryItemId(legacyId: number): Promise<InventoryItem | null> {
    const [row] = await this.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.legacy_inventory_item_id, legacyId))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<InventoryItem[]> {
    const rows = await this.db.select().from(inventoryItems).orderBy(asc(inventoryItems.name));
    return rows.map((r) => this.toDomain(r));
  }

  async search(filter: InventoryItemListFilter, page?: PageRequest): Promise<{ items: InventoryItem[]; total: number }> {
    const where = and(filter.itemType ? eq(inventoryItems.item_type, filter.itemType) : undefined, searchCondition(filter.q, inventoryItems.name));
    const query = this.db
      .select()
      .from(inventoryItems)
      .where(where)
      .orderBy(
        ...orderByOf(
          { name: inventoryItems.name, createdAt: inventoryItems.created_at, unitCost: inventoryItems.unit_cost },
          filter.sort,
          filter.order,
          { key: "name", order: "asc" },
          inventoryItems.id
        )
      )
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(inventoryItems).where(where)));
    return { items: rows.map((r) => this.toDomain(r)), total };
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

  private toDomain(row: typeof inventoryItems.$inferSelect): InventoryItem {
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
