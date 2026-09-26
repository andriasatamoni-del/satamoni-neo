import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { TalabatProductMapping } from "../../domain/talabat-product-mapping.aggregate";
import type { TalabatProductMappingRepositoryPort } from "../../domain/ports/talabat-product-mapping-repository.port";
import type { TalabatProductMappingTable } from "./talabat.schema";

@Injectable()
export class KyselyTalabatProductMappingRepository implements TalabatProductMappingRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(mapping: TalabatProductMapping): Promise<void> {
    const row = this.toRow(mapping);
    await this.db
      .insertInto("talabat_product_mapping")
      .values(row)
      .onConflict((oc) =>
        oc.columns(["branch_id", "talabat_item_id"]).doUpdateSet({
          menu_item_id: row.menu_item_id,
          variant_id: row.variant_id,
          updated_at: row.updated_at,
        })
      )
      .execute();
  }

  async findByBranchAndTalabatItemId(branchId: string, talabatItemId: string): Promise<TalabatProductMapping | null> {
    const row = await this.db
      .selectFrom("talabat_product_mapping")
      .selectAll()
      .where("branch_id", "=", branchId)
      .where("talabat_item_id", "=", talabatItemId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async listByBranch(branchId: string): Promise<TalabatProductMapping[]> {
    const rows = await this.db.selectFrom("talabat_product_mapping").selectAll().where("branch_id", "=", branchId).execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(mapping: TalabatProductMapping) {
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

  private toDomain(row: Selectable<TalabatProductMappingTable>): TalabatProductMapping {
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
