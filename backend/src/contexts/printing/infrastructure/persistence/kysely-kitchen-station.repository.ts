import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { KitchenStation } from "../../domain/kitchen-station.aggregate";
import type { KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import type { KitchenStationsTable } from "./printing.schema";
import { DuplicateKitchenStationNameError } from "../../domain/errors";

@Injectable()
export class KyselyKitchenStationRepository implements KitchenStationRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

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
        .insertInto("kitchen_stations")
        .values(row)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({ name: row.name, printer_id: row.printer_id, is_active: row.is_active })
        )
        .execute();
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new DuplicateKitchenStationNameError();
      throw err;
    }
  }

  async findById(id: string): Promise<KitchenStation | null> {
    const row = await this.db.selectFrom("kitchen_stations").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async listByBranch(branchId: string): Promise<KitchenStation[]> {
    const rows = await this.db
      .selectFrom("kitchen_stations")
      .selectAll()
      .where("branch_id", "=", branchId)
      .orderBy("name")
      .execute();
    return rows.map((r) => this.toDomain(r));
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("kitchen_stations").where("id", "=", id).execute();
  }

  private toDomain(row: Selectable<KitchenStationsTable>): KitchenStation {
    return KitchenStation.reconstitute(row.id, {
      branchId: row.branch_id,
      name: row.name,
      printerId: row.printer_id,
      isActive: row.is_active,
      createdAt: row.created_at,
    });
  }
}
