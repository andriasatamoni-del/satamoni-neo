import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { InventoryBatch, type InventoryBatchSourceType, type InventoryBatchStatus } from "../../domain/inventory-batch.aggregate";
import type { InventoryBatchRepositoryPort } from "../../domain/ports/inventory-batch-repository.port";
import type { InventoryBatchesTable } from "./inventory-batch.schema";

@Injectable()
export class KyselyInventoryBatchRepository implements InventoryBatchRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(batch: InventoryBatch): Promise<void> {
    await this.db
      .insertInto("inventory_batches")
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
      .onConflict((oc) => oc.column("id").doUpdateSet({ remaining_quantity: batch.remainingQuantity, status: batch.status }))
      .execute();
  }

  async findById(id: string): Promise<InventoryBatch | null> {
    const row = await this.db.selectFrom("inventory_batches").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async nextBatchNumber(): Promise<string> {
    const { rows } = await sql<{ nextval: string }>`SELECT nextval('inventory_batch_number_seq')`.execute(this.db);
    return `BATCH-${String(rows[0].nextval).padStart(6, "0")}`;
  }

  async listActiveByItem(inventoryItemId: string, branchId: string): Promise<InventoryBatch[]> {
    const rows = await this.db
      .selectFrom("inventory_batches")
      .selectAll()
      .where("inventory_item_id", "=", inventoryItemId)
      .where("branch_id", "=", branchId)
      .where("status", "=", "active")
      .orderBy(sql`expiry_date IS NULL`)
      .orderBy("expiry_date", "asc")
      .execute();
    return rows.map((r) => this.toDomain(r));
  }

  async listExpiringSoon(input: { days: number; branchId: string | null }): Promise<InventoryBatch[]> {
    let query = this.db
      .selectFrom("inventory_batches")
      .selectAll()
      .where("status", "=", "active")
      .where("remaining_quantity", ">", 0)
      .where("expiry_date", "is not", null)
      .where("expiry_date", "<=", sql<Date>`((now() AT TIME ZONE 'Africa/Cairo')::date + (${input.days} || ' days')::interval)`);
    if (input.branchId) query = query.where("branch_id", "=", input.branchId);
    const rows = await query.orderBy("expiry_date", "asc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<InventoryBatchesTable>): InventoryBatch {
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
