import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { SupplierPayment } from "../../domain/supplier-payment.aggregate";
import type { SupplierPaymentRepositoryPort } from "../../domain/ports/supplier-payment-repository.port";
import { supplierPayments } from "./procurement.tables";

@Injectable()
export class SupplierPaymentRepository implements SupplierPaymentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(payment: SupplierPayment): Promise<void> {
    await this.db
      .insert(supplierPayments)
      .values({
        id: payment.id,
        supplier_id: payment.supplierId,
        branch_id: payment.branchId,
        supplier_invoice_id: payment.supplierInvoiceId,
        treasury_id: payment.treasuryId,
        amount: payment.amount,
        payment_date: payment.paymentDate,
        reference_number: payment.referenceNumber,
        notes: payment.notes,
        journal_entry_id: payment.journalEntryId,
        created_by: payment.createdBy,
        created_at: payment.createdAt,
      })
      .onConflictDoUpdate({ target: supplierPayments.id, set: { journal_entry_id: payment.journalEntryId } });
  }

  async findById(id: string): Promise<SupplierPayment | null> {
    const [row] = await this.db.select().from(supplierPayments).where(eq(supplierPayments.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listByInvoiceId(supplierInvoiceId: string): Promise<SupplierPayment[]> {
    const rows = await this.db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.supplier_invoice_id, supplierInvoiceId))
      .orderBy(asc(supplierPayments.created_at));
    return rows.map((r) => this.toDomain(r));
  }

  async sumByInvoiceId(supplierInvoiceId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${supplierPayments.amount}), 0)` })
      .from(supplierPayments)
      .where(eq(supplierPayments.supplier_invoice_id, supplierInvoiceId));
    return Number(row?.total ?? 0);
  }

  async countByInvoiceId(supplierInvoiceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(supplierPayments)
      .where(eq(supplierPayments.supplier_invoice_id, supplierInvoiceId));
    return Number(row?.n ?? 0);
  }

  async list(filter?: { supplierId?: string; branchId?: string }): Promise<SupplierPayment[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { supplierId?: string; branchId?: string }, page?: PageRequest): Promise<{ rows: SupplierPayment[]; total: number }> {
    const where = and(
      filter?.supplierId ? eq(supplierPayments.supplier_id, filter.supplierId) : undefined,
      filter?.branchId ? eq(supplierPayments.branch_id, filter.branchId) : undefined
    );
    const query = this.db.select().from(supplierPayments).where(where).orderBy(desc(supplierPayments.created_at), desc(supplierPayments.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(supplierPayments).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  private toDomain(row: typeof supplierPayments.$inferSelect): SupplierPayment {
    return SupplierPayment.reconstitute(row.id, {
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      supplierInvoiceId: row.supplier_invoice_id,
      treasuryId: row.treasury_id,
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      referenceNumber: row.reference_number,
      notes: row.notes,
      journalEntryId: row.journal_entry_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
    });
  }
}
