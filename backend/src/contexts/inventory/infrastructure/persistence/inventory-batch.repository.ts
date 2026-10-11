import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, isNotNull, lte, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { InventoryBatch, type InventoryBatchSourceType, type InventoryBatchStatus } from "../../domain/inventory-batch.aggregate";
import type { InventoryBatchRepositoryPort } from "../../domain/ports/inventory-batch-repository.port";
import { inventoryBatches } from "./inventory.tables";

@Injectable()
export class InventoryBatchRepository implements InventoryBatchRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(batch: InventoryBatch): Promise<void> {
    await this.db
      .insert(inventoryBatches)
      .values({
        id: batch.id,
        batch_number: batch.batchNumber,
        inventory_item_id: batch.inventoryItemId,
        branch_id: batch.branchId,
        received_quantity: batch.receivedQuantity,
        remaining_quantity: batch.remainingQuantity,
        unit_cost: batch.unitCost,
        expiry_date: batch.expiryDate,
        production_date: batch.productionDate,
        source_type: batch.sourceType,
        source_id: batch.sourceId,
        status: batch.status,
        created_by: batch.createdBy,
        created_at: batch.createdAt,
      })
      .onConflictDoUpdate({ target: inventoryBatches.id, set: { remaining_quantity: batch.remainingQuantity, status: batch.status } });
  }

  async findById(id: string): Promise<InventoryBatch | null> {
    const [row] = await this.db.select().from(inventoryBatches).where(eq(inventoryBatches.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async nextBatchNumber(): Promise<string> {
    // nextval() has no builder method: select it as a fragment from a one-row VALUES list
    const [row] = await this.db
      .select({ nextval: sql<string>`nextval('inventory_batch_number_seq')` })
      .from(sql`(VALUES (1)) AS seq`);
    return `BATCH-${String(row.nextval).padStart(6, "0")}`;
  }

  async listActiveByItem(inventoryItemId: string, branchId: string): Promise<InventoryBatch[]> {
    const rows = await this.db
      .select()
      .from(inventoryBatches)
      .where(
        and(
          eq(inventoryBatches.inventory_item_id, inventoryItemId),
          eq(inventoryBatches.branch_id, branchId),
          eq(inventoryBatches.status, "active")
        )
      )
      .orderBy(sql`${inventoryBatches.expiry_date} IS NULL`, asc(inventoryBatches.expiry_date));
    return rows.map((r) => this.toDomain(r));
  }

  async listExpiringSoon(input: { days: number; branchId: string | null }): Promise<InventoryBatch[]> {
    const rows = await this.db
      .select()
      .from(inventoryBatches)
      .where(
        and(
          eq(inventoryBatches.status, "active"),
          gt(inventoryBatches.remaining_quantity, 0),
          isNotNull(inventoryBatches.expiry_date),
          lte(inventoryBatches.expiry_date, sql`((now() AT TIME ZONE 'Africa/Cairo')::date + (${input.days} || ' days')::interval)`),
          input.branchId ? eq(inventoryBatches.branch_id, input.branchId) : undefined
        )
      )
      .orderBy(asc(inventoryBatches.expiry_date));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof inventoryBatches.$inferSelect): InventoryBatch {
    return InventoryBatch.reconstitute(row.id, {
      batchNumber: row.batch_number,
      inventoryItemId: row.inventory_item_id,
      branchId: row.branch_id,
      receivedQuantity: Number(row.received_quantity),
      remainingQuantity: Number(row.remaining_quantity),
      unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
      expiryDate: row.expiry_date,
      productionDate: row.production_date,
      sourceType: row.source_type as InventoryBatchSourceType,
      sourceId: row.source_id,
      status: row.status as InventoryBatchStatus,
      createdBy: row.created_by,
      createdAt: row.created_at,
    });
  }
}
