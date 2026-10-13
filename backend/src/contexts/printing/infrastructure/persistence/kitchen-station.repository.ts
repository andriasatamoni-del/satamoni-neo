import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { pgErrorCode } from "../../../../shared/database/transaction-context";
import { KitchenStation } from "../../domain/kitchen-station.aggregate";
import type { KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { DuplicateKitchenStationNameError } from "../../domain/errors";
import { kitchenStations } from "./printing.tables";

@Injectable()
export class KitchenStationRepository implements KitchenStationRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(station: KitchenStation): Promise<void> {
    const row = {
      id: station.id,
      branch_id: station.branchId,
      name: station.name,
      printer_id: station.printerId,
      is_active: station.isActive,
      created_at: station.createdAt,
    };
    try {
      await this.db
        .insert(kitchenStations)
        .values(row)
        .onConflictDoUpdate({
          target: kitchenStations.id,
          set: { name: row.name, printer_id: row.printer_id, is_active: row.is_active },
        });
    } catch (err) {
      if (pgErrorCode(err) === "23505") throw new DuplicateKitchenStationNameError();
      throw err;
    }
  }

  async findById(id: string): Promise<KitchenStation | null> {
    const [row] = await this.db.select().from(kitchenStations).where(eq(kitchenStations.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listByBranch(branchId: string): Promise<KitchenStation[]> {
    const rows = await this.db
      .select()
      .from(kitchenStations)
      .where(eq(kitchenStations.branch_id, branchId))
      .orderBy(asc(kitchenStations.name));
    return rows.map((r) => this.toDomain(r));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(kitchenStations).where(eq(kitchenStations.id, id));
  }

  private toDomain(row: typeof kitchenStations.$inferSelect): KitchenStation {
    return KitchenStation.reconstitute(row.id, {
      branchId: row.branch_id,
      name: row.name,
      printerId: row.printer_id,
      isActive: row.is_active,
      createdAt: row.created_at,
    });
  }
}
