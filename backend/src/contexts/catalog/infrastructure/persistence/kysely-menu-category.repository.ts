import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { MenuCategory, type MenuGroup } from "../../domain/menu-category.aggregate";
import type { CatalogLayoutRepositoryPort, MenuCategoryRepositoryPort } from "../../domain/ports/menu-category-repository.port";
import type { MenuCategoriesTable } from "./catalog.schema";

@Injectable()
export class KyselyMenuCategoryRepository implements MenuCategoryRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(category: MenuCategory): Promise<void> {
    const row = this.toRow(category);
    await this.db
      .insertInto("menu_categories")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          display_order: row.display_order,
          menu_group: row.menu_group,
          is_active: row.is_active,
          station_id: row.station_id,
          archived_at: row.archived_at,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<MenuCategory | null> {
    const row = await this.db.selectFrom("menu_categories").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyCategoryId(legacyId: number): Promise<MenuCategory | null> {
    const row = await this.db
      .selectFrom("menu_categories")
      .selectAll()
      .where("legacy_category_id", "=", legacyId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(opts: { archived?: boolean } = {}): Promise<MenuCategory[]> {
    let query = this.db.selectFrom("menu_categories").selectAll();
    if (opts.archived === true) query = query.where("archived_at", "is not", null);
    if (opts.archived === false) query = query.where("archived_at", "is", null);
    // display_order ثم الاسم: ترتيب ثابت حتى لو فيه أقسام بنفس الرقم (الأقسام القديمة كلها 0)
    const rows = await query.orderBy("display_order").orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(category: MenuCategory) {
    return {
      id: category.id,
      name: category.name,
      display_order: category.displayOrder,
      menu_group: category.menuGroup,
      is_active: category.isActive,
      legacy_category_id: category.legacyCategoryId,
      station_id: category.stationId,
      archived_at: category.archivedAt,
    };
  }

  private toDomain(row: Selectable<MenuCategoriesTable>): MenuCategory {
    return MenuCategory.reconstitute(row.id, {
      name: row.name,
      displayOrder: row.display_order,
      menuGroup: row.menu_group as MenuGroup,
      isActive: row.is_active,
      legacyCategoryId: row.legacy_category_id,
      stationId: row.station_id,
      archivedAt: row.archived_at,
    });
  }
}

const COMBOS_POSITION_KEY = "combos_position";

@Injectable()
export class KyselyCatalogLayoutRepository implements CatalogLayoutRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getCombosPosition(): Promise<number | null> {
    const row = await this.db.selectFrom("catalog_layout").select("value").where("key", "=", COMBOS_POSITION_KEY).executeTakeFirst();
    return row ? row.value : null;
  }

  async setCombosPosition(position: number): Promise<void> {
    await this.db
      .insertInto("catalog_layout")
      .values({ key: COMBOS_POSITION_KEY, value: position })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value: position }))
      .execute();
  }
}
