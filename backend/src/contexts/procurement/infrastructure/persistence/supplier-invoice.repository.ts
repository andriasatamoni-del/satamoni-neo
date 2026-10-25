import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { SupplierInvoice, type SupplierInvoiceStatus } from "../../domain/supplier-invoice.aggregate";
import type { SupplierInvoiceRepositoryPort } from "../../domain/ports/supplier-invoice-repository.port";
import { supplierInvoiceLines, supplierInvoices } from "./procurement.tables";

@Injectable()
export class SupplierInvoiceRepository implements SupplierInvoiceRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(invoice: SupplierInvoice): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(supplierInvoices)
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
        .onConflictDoUpdate({
          target: supplierInvoices.id,
          set: {
            status: invoice.status,
            variance_journal_entry_id: invoice.varianceJournalEntryId,
            approved_by: invoice.approvedBy,
            approved_at: invoice.approvedAt,
            cancelled_by: invoice.cancelledBy,
            cancelled_at: invoice.cancelledAt,
            cancellation_reason: invoice.cancellationReason,
            updated_at: invoice.updatedAt,
          },
        });

      for (const line of invoice.lines) {
        await tx
          .insert(supplierInvoiceLines)
          .values({
            id: line.id,
            supplier_invoice_id: invoice.id,
            inventory_item_id: line.inventoryItemId,
            invoiced_quantity: line.invoicedQuantity,
            unit_price: line.unitPrice,
            line_total: line.lineTotal,
          })
          .onConflictDoNothing({ target: supplierInvoiceLines.id });
      }
    });
  }

  async findById(id: string): Promise<SupplierInvoice | null> {
    const [row] = await this.db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async existsBySupplierAndNumber(supplierId: string, supplierInvoiceNumber: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(and(eq(supplierInvoices.supplier_id, supplierId), eq(supplierInvoices.supplier_invoice_number, supplierInvoiceNumber)))
      .limit(1);
    return !!row;
  }

  async list(filter?: { supplierId?: string; branchId?: string; status?: string }): Promise<SupplierInvoice[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { supplierId?: string; branchId?: string; status?: string }, page?: PageRequest): Promise<{ rows: SupplierInvoice[]; total: number }> {
    const where = and(
      filter?.supplierId ? eq(supplierInvoices.supplier_id, filter.supplierId) : undefined,
      filter?.branchId ? eq(supplierInvoices.branch_id, filter.branchId) : undefined,
      filter?.status ? eq(supplierInvoices.status, filter.status) : undefined
    );
    const query = this.db.select().from(supplierInvoices).where(where).orderBy(desc(supplierInvoices.created_at), desc(supplierInvoices.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(supplierInvoices).where(where)));
    const invoices: SupplierInvoice[] = [];
    for (const row of rows) invoices.push(this.toDomain(row, await this.loadLines(row.id)));
    return { rows: invoices, total };
  }

  private loadLines(invoiceId: string): Promise<(typeof supplierInvoiceLines.$inferSelect)[]> {
    return this.db.select().from(supplierInvoiceLines).where(eq(supplierInvoiceLines.supplier_invoice_id, invoiceId));
  }

  private toDomain(
    row: typeof supplierInvoices.$inferSelect,
    lineRows: (typeof supplierInvoiceLines.$inferSelect)[]
  ): SupplierInvoice {
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
