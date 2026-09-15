import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { MenuCategory, type MenuGroup } from "../../domain/menu-category.aggregate";
import type { MenuCategoryRepositoryPort } from "../../domain/ports/menu-category-repository.port";
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

  async list(): Promise<MenuCategory[]> {
    const rows = await this.db.selectFrom("menu_categories").selectAll().orderBy("display_order").execute();
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
    };
  }

  private toDomain(row: Selectable<MenuCategoriesTable>): MenuCategory {
    return MenuCategory.reconstitute(row.id, {
      name: row.name,
      displayOrder: row.display_order,
      menuGroup: row.menu_group as MenuGroup,
      isActive: row.is_active,
      legacyCategoryId: row.legacy_category_id,
    });
  }
}
