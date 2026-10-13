import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Driver, type DriverStatus } from "../../domain/driver.aggregate";
import type { DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import { drivers } from "./delivery.tables";

@Injectable()
export class DriverRepository implements DriverRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(driver: Driver): Promise<void> {
    const row = this.toRow(driver);
    await this.db
      .insert(drivers)
      .values(row)
      .onConflictDoUpdate({ target: drivers.id, set: { name: row.name, phone: row.phone, status: row.status } });
  }

  async findById(id: string): Promise<Driver | null> {
    const [row] = await this.db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyDriverId(legacyId: number): Promise<Driver | null> {
    const [row] = await this.db.select().from(drivers).where(eq(drivers.legacy_driver_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string }): Promise<Driver[]> {
    const rows = await this.db
      .select()
      .from(drivers)
      .where(filter?.branchId ? eq(drivers.branch_id, filter.branchId) : undefined)
      .orderBy(asc(drivers.name));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(driver: Driver): typeof drivers.$inferInsert {
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

  private toDomain(row: typeof drivers.$inferSelect): Driver {
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
