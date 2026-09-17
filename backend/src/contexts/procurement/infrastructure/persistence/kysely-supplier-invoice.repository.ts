import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { SupplierInvoice, type SupplierInvoiceStatus } from "../../domain/supplier-invoice.aggregate";
import type { SupplierInvoiceRepositoryPort } from "../../domain/ports/supplier-invoice-repository.port";
import type { SupplierInvoiceLinesTable, SupplierInvoicesTable } from "./procurement.schema";

@Injectable()
export class KyselySupplierInvoiceRepository implements SupplierInvoiceRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(invoice: SupplierInvoice): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("supplier_invoices")
        .values({
          id: invoice.id,
          supplier_id: invoice.supplierId,
          branch_id: invoice.branchId,
          goods_receipt_id: invoice.goodsReceiptId,
          supplier_invoice_number: invoice.supplierInvoiceNumber,
          invoice_date: invoice.invoiceDate,
          due_date: invoice.dueDate,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          total: invoice.total,
          matched_total: invoice.matchedTotal,
          variance_amount: invoice.varianceAmount,
          status: invoice.status,
          variance_journal_entry_id: invoice.varianceJournalEntryId,
          notes: invoice.notes,
          created_by: invoice.createdBy,
          approved_by: invoice.approvedBy,
          approved_at: invoice.approvedAt,
          cancelled_by: invoice.cancelledBy,
          cancelled_at: invoice.cancelledAt,
          cancellation_reason: invoice.cancellationReason,
          created_at: invoice.createdAt,
          updated_at: invoice.updatedAt,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            status: invoice.status,
            variance_journal_entry_id: invoice.varianceJournalEntryId,
            approved_by: invoice.approvedBy,
            approved_at: invoice.approvedAt,
            cancelled_by: invoice.cancelledBy,
            cancelled_at: invoice.cancelledAt,
            cancellation_reason: invoice.cancellationReason,
            updated_at: invoice.updatedAt,
          })
        )
        .execute();

      for (const line of invoice.lines) {
        await trx
          .insertInto("supplier_invoice_lines")
          .values({
            id: line.id,
            supplier_invoice_id: invoice.id,
            inventory_item_id: line.inventoryItemId,
            invoiced_quantity: line.invoicedQuantity,
            unit_price: line.unitPrice,
            line_total: line.lineTotal,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }
    });
  }

  async findById(id: string): Promise<SupplierInvoice | null> {
    const row = await this.db.selectFrom("supplier_invoices").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async existsBySupplierAndNumber(supplierId: string, supplierInvoiceNumber: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("supplier_invoices")
      .select("id")
      .where("supplier_id", "=", supplierId)
      .where("supplier_invoice_number", "=", supplierInvoiceNumber)
      .executeTakeFirst();
    return !!row;
  }

  async list(filter?: { supplierId?: string; branchId?: string; status?: string }): Promise<SupplierInvoice[]> {
    let query = this.db.selectFrom("supplier_invoices").selectAll();
    if (filter?.supplierId) query = query.where("supplier_id", "=", filter.supplierId);
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    const invoices: SupplierInvoice[] = [];
    for (const row of rows) invoices.push(this.toDomain(row, await this.loadLines(row.id)));
    return invoices;
  }

  private loadLines(invoiceId: string): Promise<Selectable<SupplierInvoiceLinesTable>[]> {
    return this.db.selectFrom("supplier_invoice_lines").selectAll().where("supplier_invoice_id", "=", invoiceId).execute();
  }

  private toDomain(row: Selectable<SupplierInvoicesTable>, lineRows: Selectable<SupplierInvoiceLinesTable>[]): SupplierInvoice {
    return SupplierInvoice.reconstitute(row.id, {
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      goodsReceiptId: row.goods_receipt_id,
      supplierInvoiceNumber: row.supplier_invoice_number,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        invoicedQuantity: Number(l.invoiced_quantity),
        unitPrice: Number(l.unit_price),
        lineTotal: Number(l.line_total),
      })),
      subtotal: Number(row.subtotal),
      tax: Number(row.tax),
      total: Number(row.total),
      matchedTotal: Number(row.matched_total),
      varianceAmount: Number(row.variance_amount),
      status: row.status as SupplierInvoiceStatus,
      varianceJournalEntryId: row.variance_journal_entry_id,
      notes: row.notes,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
