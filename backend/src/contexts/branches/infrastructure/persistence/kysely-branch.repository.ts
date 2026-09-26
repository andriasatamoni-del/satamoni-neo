import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Branch } from "../../domain/branch.aggregate";
import type { BranchRepositoryPort } from "../../domain/ports/branch-repository.port";
import type { BranchesTable } from "./branch.schema";

@Injectable()
export class KyselyBranchRepository implements BranchRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(branch: Branch): Promise<void> {
    const row = this.toRow(branch);
    await this.db
      .insertInto("branches")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          address: row.address,
          phone: row.phone,
          hours: row.hours,
          lat: row.lat,
          lng: row.lng,
          is_central_kitchen: row.is_central_kitchen,
          supports_dine_in: row.supports_dine_in,
          talabat_branch_id: row.talabat_branch_id,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Branch | null> {
    const row = await this.db.selectFrom("branches").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyBranchId(legacyBranchId: number): Promise<Branch | null> {
    const row = await this.db
      .selectFrom("branches")
      .selectAll()
      .where("legacy_branch_id", "=", legacyBranchId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByTalabatBranchId(talabatBranchId: string): Promise<Branch | null> {
    const row = await this.db
      .selectFrom("branches")
      .selectAll()
      .where("talabat_branch_id", "=", talabatBranchId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<Branch[]> {
    const rows = await this.db.selectFrom("branches").selectAll().orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(branch: Branch) {
    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      hours: branch.hours,
      lat: branch.lat,
      lng: branch.lng,
      is_central_kitchen: branch.isCentralKitchen,
      supports_dine_in: branch.supportsDineIn,
      legacy_branch_id: branch.legacyBranchId,
      talabat_branch_id: branch.talabatBranchId,
    };
  }

  private toDomain(row: Selectable<BranchesTable>): Branch {
    return Branch.reconstitute(row.id, {
      name: row.name,
      address: row.address,
      phone: row.phone,
      hours: row.hours,
      lat: row.lat,
      lng: row.lng,
      isCentralKitchen: row.is_central_kitchen,
      supportsDineIn: row.supports_dine_in,
      legacyBranchId: row.legacy_branch_id,
      talabatBranchId: row.talabat_branch_id,
    });
  }
}
