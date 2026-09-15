import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Supplier, type SupplierStatus } from "../../domain/supplier.aggregate";
import type { SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";
import type { SuppliersTable } from "./procurement.schema";

@Injectable()
export class KyselySupplierRepository implements SupplierRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(supplier: Supplier): Promise<void> {
    const row = this.toRow(supplier);
    await this.db
      .insertInto("suppliers")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          contact_person: row.contact_person,
          phone: row.phone,
          email: row.email,
          address: row.address,
          payment_terms: row.payment_terms,
          status: row.status,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Supplier | null> {
    const row = await this.db.selectFrom("suppliers").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacySupplierId(legacyId: number): Promise<Supplier | null> {
    const row = await this.db
      .selectFrom("suppliers")
      .selectAll()
      .where("legacy_supplier_id", "=", legacyId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async existsByName(name: string): Promise<boolean> {
    const row = await this.db.selectFrom("suppliers").select("id").where("name", "=", name.trim()).executeTakeFirst();
    return !!row;
  }

  async list(): Promise<Supplier[]> {
    const rows = await this.db.selectFrom("suppliers").selectAll().orderBy("name").execute();
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

  private toDomain(row: Selectable<SuppliersTable>): Supplier {
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
