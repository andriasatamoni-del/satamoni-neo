import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Purchase, type PurchaseStatus } from "../../domain/purchase.aggregate";
import type { PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import type { PurchaseLinesTable, PurchasesTable } from "./purchase.schema";

@Injectable()
export class KyselyPurchaseRepository implements PurchaseRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(purchase: Purchase): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("purchases")
        .values({
          id: purchase.id,
          branch_id: purchase.branchId,
          business_date: purchase.businessDate,
          category: purchase.category,
          amount: purchase.amount,
          notes: purchase.notes,
          supplier_id: purchase.supplierId,
          supplier_document_number: purchase.supplierDocumentNumber,
          status: purchase.status,
          created_by: purchase.createdBy,
          reviewed_by: purchase.reviewedBy,
          reviewed_at: purchase.reviewedAt,
          rejection_reason: purchase.rejectionReason,
          posted_to_inventory: purchase.postedToInventory,
          created_at: purchase.createdAt,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            amount: purchase.amount,
            notes: purchase.notes,
            status: purchase.status,
            reviewed_by: purchase.reviewedBy,
            reviewed_at: purchase.reviewedAt,
            rejection_reason: purchase.rejectionReason,
            posted_to_inventory: purchase.postedToInventory,
          })
        )
        .execute();

      await trx.deleteFrom("purchase_lines").where("purchase_id", "=", purchase.id).execute();
      for (const line of purchase.lines) {
        await trx
          .insertInto("purchase_lines")
          .values({
            id: line.id,
            purchase_id: purchase.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unitPrice,
            line_total: line.lineTotal,
          })
          .execute();
      }
    });
  }

  async findById(id: string): Promise<Purchase | null> {
    const row = await this.db.selectFrom("purchases").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row, await this.loadLines(id)) : null;
  }

  async findDuplicateReference(input: { supplierId: string; supplierDocumentNumber: string; branchId: string }): Promise<Purchase[]> {
    const rows = await this.db
      .selectFrom("purchases")
      .selectAll()
      .where("supplier_id", "=", input.supplierId)
      .where("supplier_document_number", "=", input.supplierDocumentNumber)
      .where("branch_id", "=", input.branchId)
      .where("status", "!=", "REJECTED")
      .execute();
    const purchases: Purchase[] = [];
    for (const row of rows) purchases.push(this.toDomain(row, await this.loadLines(row.id)));
    return purchases;
  }

  async list(filter?: { branchId?: string; businessDate?: Date; status?: string }): Promise<Purchase[]> {
    let query = this.db.selectFrom("purchases").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.businessDate) query = query.where("business_date", "=", filter.businessDate);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("business_date", "desc").orderBy("created_at", "desc").execute();
    const purchases: Purchase[] = [];
    for (const row of rows) purchases.push(this.toDomain(row, await this.loadLines(row.id)));
    return purchases;
  }

  private loadLines(purchaseId: string): Promise<Selectable<PurchaseLinesTable>[]> {
    return this.db.selectFrom("purchase_lines").selectAll().where("purchase_id", "=", purchaseId).execute();
  }

  private toDomain(row: Selectable<PurchasesTable>, lineRows: Selectable<PurchaseLinesTable>[]): Purchase {
    return Purchase.reconstitute(row.id, {
      branchId: row.branch_id,
      businessDate: row.business_date,
      category: row.category,
      amount: Number(row.amount),
      notes: row.notes,
      supplierId: row.supplier_id,
      supplierDocumentNumber: row.supplier_document_number,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        quantity: Number(l.quantity),
        unit: l.unit,
        unitPrice: Number(l.unit_price),
        lineTotal: Number(l.line_total),
      })),
      status: row.status as PurchaseStatus,
      createdBy: row.created_by,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
      postedToInventory: row.posted_to_inventory,
      createdAt: row.created_at,
    });
  }
}
