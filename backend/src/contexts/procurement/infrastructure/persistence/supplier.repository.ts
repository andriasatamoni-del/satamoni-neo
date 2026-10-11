import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Supplier, type SupplierStatus } from "../../domain/supplier.aggregate";
import type { SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";
import { suppliers } from "./procurement.tables";

@Injectable()
export class SupplierRepository implements SupplierRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(supplier: Supplier): Promise<void> {
    const row = this.toRow(supplier);
    await this.db
      .insert(suppliers)
      .values(row)
      .onConflictDoUpdate({
        target: suppliers.id,
        set: {
          name: row.name,
          contact_person: row.contact_person,
          phone: row.phone,
          email: row.email,
          address: row.address,
          payment_terms: row.payment_terms,
          status: row.status,
        },
      });
  }

  async findById(id: string): Promise<Supplier | null> {
    const [row] = await this.db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacySupplierId(legacyId: number): Promise<Supplier | null> {
    const [row] = await this.db.select().from(suppliers).where(eq(suppliers.legacy_supplier_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsByName(name: string): Promise<boolean> {
    const [row] = await this.db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, name.trim())).limit(1);
    return !!row;
  }

  async list(): Promise<Supplier[]> {
    const rows = await this.db.select().from(suppliers).orderBy(asc(suppliers.name));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(supplier: Supplier) {
    return {
      id: supplier.id,
      name: supplier.name,
      contact_person: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      payment_terms: supplier.paymentTerms,
      status: supplier.status,
      legacy_supplier_id: supplier.legacySupplierId,
      created_at: supplier.createdAt,
    };
  }

  private toDomain(row: typeof suppliers.$inferSelect): Supplier {
    return Supplier.reconstitute(row.id, {
      name: row.name,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      paymentTerms: row.payment_terms,
      status: row.status as SupplierStatus,
      legacySupplierId: row.legacy_supplier_id,
      createdAt: row.created_at,
    });
  }
}
