import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { TalabatProductMapping } from "../../domain/talabat-product-mapping.aggregate";
import type { TalabatProductMappingRepositoryPort } from "../../domain/ports/talabat-product-mapping-repository.port";
import { talabatProductMapping } from "./talabat.tables";

@Injectable()
export class TalabatProductMappingRepository implements TalabatProductMappingRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(mapping: TalabatProductMapping): Promise<void> {
    const row = this.toRow(mapping);
    await this.db
      .insert(talabatProductMapping)
      .values(row)
      .onConflictDoUpdate({
        target: [talabatProductMapping.branch_id, talabatProductMapping.talabat_item_id],
        set: {
          menu_item_id: row.menu_item_id,
          variant_id: row.variant_id,
          updated_at: row.updated_at,
        },
      });
  }

  async findByBranchAndTalabatItemId(branchId: string, talabatItemId: string): Promise<TalabatProductMapping | null> {
    const [row] = await this.db
      .select()
      .from(talabatProductMapping)
      .where(and(eq(talabatProductMapping.branch_id, branchId), eq(talabatProductMapping.talabat_item_id, talabatItemId)))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listByBranch(branchId: string): Promise<TalabatProductMapping[]> {
    const rows = await this.db.select().from(talabatProductMapping).where(eq(talabatProductMapping.branch_id, branchId));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(mapping: TalabatProductMapping): typeof talabatProductMapping.$inferInsert {
    return {
      id: mapping.id,
      branch_id: mapping.branchId,
      talabat_item_id: mapping.talabatItemId,
      menu_item_id: mapping.menuItemId,
      variant_id: mapping.variantId,
      created_at: mapping.createdAt,
      updated_at: mapping.updatedAt,
    };
  }

  private toDomain(row: typeof talabatProductMapping.$inferSelect): TalabatProductMapping {
    return TalabatProductMapping.reconstitute(row.id, {
      branchId: row.branch_id,
      talabatItemId: row.talabat_item_id,
      menuItemId: row.menu_item_id,
      variantId: row.variant_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
