import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Driver, type DriverStatus } from "../../domain/driver.aggregate";
import type { DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import type { DriversTable } from "./delivery.schema";

@Injectable()
export class KyselyDriverRepository implements DriverRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(driver: Driver): Promise<void> {
    const row = this.toRow(driver);
    await this.db
      .insertInto("drivers")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({ name: row.name, phone: row.phone, status: row.status }))
      .execute();
  }

  async findById(id: string): Promise<Driver | null> {
    const row = await this.db.selectFrom("drivers").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyDriverId(legacyId: number): Promise<Driver | null> {
    const row = await this.db.selectFrom("drivers").selectAll().where("legacy_driver_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string }): Promise<Driver[]> {
    let query = this.db.selectFrom("drivers").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    const rows = await query.orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(driver: Driver) {
    return {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      branch_id: driver.branchId,
      status: driver.status,
      legacy_driver_id: driver.legacyDriverId,
      created_at: driver.createdAt,
    };
  }

  private toDomain(row: Selectable<DriversTable>): Driver {
    return Driver.reconstitute(row.id, {
      name: row.name,
      phone: row.phone,
      branchId: row.branch_id,
      status: row.status as DriverStatus,
      legacyDriverId: row.legacy_driver_id,
      createdAt: row.created_at,
    });
  }
}
