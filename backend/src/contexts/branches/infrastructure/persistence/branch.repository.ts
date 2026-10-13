import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Branch } from "../../domain/branch.aggregate";
import type { BranchRepositoryPort } from "../../domain/ports/branch-repository.port";
import { branches } from "./branches.tables";

@Injectable()
export class BranchRepository implements BranchRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(branch: Branch): Promise<void> {
    const row = this.toRow(branch);
    await this.db
      .insert(branches)
      .values(row)
      .onConflictDoUpdate({
        target: branches.id,
        set: {
          name: row.name,
          address: row.address,
          phone: row.phone,
          hours: row.hours,
          lat: row.lat,
          lng: row.lng,
          is_central_kitchen: row.is_central_kitchen,
          supports_dine_in: row.supports_dine_in,
          talabat_branch_id: row.talabat_branch_id,
        },
      });
  }

  async findById(id: string): Promise<Branch | null> {
    const [row] = await this.db.select().from(branches).where(eq(branches.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyBranchId(legacyBranchId: number): Promise<Branch | null> {
    const [row] = await this.db.select().from(branches).where(eq(branches.legacy_branch_id, legacyBranchId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByTalabatBranchId(talabatBranchId: string): Promise<Branch | null> {
    const [row] = await this.db.select().from(branches).where(eq(branches.talabat_branch_id, talabatBranchId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<Branch[]> {
    const rows = await this.db.select().from(branches).orderBy(asc(branches.name));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(branch: Branch): typeof branches.$inferInsert {
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

  private toDomain(row: typeof branches.$inferSelect): Branch {
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
