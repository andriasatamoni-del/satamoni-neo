import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { SupplierPayment } from "../../domain/supplier-payment.aggregate";
import type { SupplierPaymentRepositoryPort } from "../../domain/ports/supplier-payment-repository.port";
import type { SupplierPaymentsTable } from "./procurement.schema";

@Injectable()
export class KyselySupplierPaymentRepository implements SupplierPaymentRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(payment: SupplierPayment): Promise<void> {
    await this.db
      .insertInto("supplier_payments")
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
      .onConflict((oc) => oc.column("id").doUpdateSet({ journal_entry_id: payment.journalEntryId }))
      .execute();
  }

  async findById(id: string): Promise<SupplierPayment | null> {
    const row = await this.db.selectFrom("supplier_payments").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async listByInvoiceId(supplierInvoiceId: string): Promise<SupplierPayment[]> {
    const rows = await this.db
      .selectFrom("supplier_payments")
      .selectAll()
      .where("supplier_invoice_id", "=", supplierInvoiceId)
      .orderBy("created_at")
      .execute();
    return rows.map((r) => this.toDomain(r));
  }

  async sumByInvoiceId(supplierInvoiceId: string): Promise<number> {
    const row = await this.db
      .selectFrom("supplier_payments")
      .select(sql<string>`COALESCE(SUM(amount), 0)`.as("total"))
      .where("supplier_invoice_id", "=", supplierInvoiceId)
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  }

  async countByInvoiceId(supplierInvoiceId: string): Promise<number> {
    const row = await this.db
      .selectFrom("supplier_payments")
      .select(sql<string>`COUNT(*)`.as("n"))
      .where("supplier_invoice_id", "=", supplierInvoiceId)
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async list(filter?: { supplierId?: string; branchId?: string }): Promise<SupplierPayment[]> {
    let query = this.db.selectFrom("supplier_payments").selectAll();
    if (filter?.supplierId) query = query.where("supplier_id", "=", filter.supplierId);
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<SupplierPaymentsTable>): SupplierPayment {
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
