import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { MenuCategory, type MenuGroup } from "../../domain/menu-category.aggregate";
import type { CatalogLayoutRepositoryPort, MenuCategoryListFilter, MenuCategoryRepositoryPort } from "../../domain/ports/menu-category-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { catalogLayout, menuCategories } from "./catalog.tables";

@Injectable()
export class MenuCategoryRepository implements MenuCategoryRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(category: MenuCategory): Promise<void> {
    const row = this.toRow(category);
    await this.db
      .insert(menuCategories)
      .values(row)
      .onConflictDoUpdate({
        target: menuCategories.id,
        set: {
          name: row.name,
          display_order: row.display_order,
          menu_group: row.menu_group,
          is_active: row.is_active,
          station_id: row.station_id,
          archived_at: row.archived_at,
        },
      });
  }

  async findById(id: string): Promise<MenuCategory | null> {
    const [row] = await this.db.select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyCategoryId(legacyId: number): Promise<MenuCategory | null> {
    const [row] = await this.db.select().from(menuCategories).where(eq(menuCategories.legacy_category_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(opts: { archived?: boolean } = {}): Promise<MenuCategory[]> {
    const archivedFilter =
      opts.archived === true ? isNotNull(menuCategories.archived_at) : opts.archived === false ? isNull(menuCategories.archived_at) : undefined;
    // display_order ثم الاسم: ترتيب ثابت حتى لو فيه أقسام بنفس الرقم (الأقسام القديمة كلها 0)
    const rows = await this.db
      .select()
      .from(menuCategories)
      .where(archivedFilter)
      .orderBy(asc(menuCategories.display_order), asc(menuCategories.name));
    return rows.map((r) => this.toDomain(r));
  }

  async search(filter: MenuCategoryListFilter, page?: PageRequest): Promise<{ categories: MenuCategory[]; total: number }> {
    const where = and(
      filter.archived === true ? isNotNull(menuCategories.archived_at) : filter.archived === false ? isNull(menuCategories.archived_at) : undefined,
      filter.menuGroup ? eq(menuCategories.menu_group, filter.menuGroup) : undefined,
      filter.status ? eq(menuCategories.is_active, filter.status === "active") : undefined,
      searchCondition(filter.q, menuCategories.name)
    );
    // `sort=name` sorts by name; otherwise display_order then name, the order the menu itself uses
    const sortBy =
      filter.sort === "name"
        ? orderByOf({ name: menuCategories.name }, filter.sort, filter.order, { key: "name", order: "asc" }, menuCategories.id)
        : [asc(menuCategories.display_order), asc(menuCategories.name), asc(menuCategories.id)];
    const query = this.db.select().from(menuCategories).where(where).orderBy(...sortBy).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(menuCategories).where(where)));
    return { categories: rows.map((r) => this.toDomain(r)), total };
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

  private toDomain(row: typeof menuCategories.$inferSelect): MenuCategory {
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
export class CatalogLayoutRepository implements CatalogLayoutRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getCombosPosition(): Promise<number | null> {
    const [row] = await this.db
      .select({ value: catalogLayout.value })
      .from(catalogLayout)
      .where(eq(catalogLayout.key, COMBOS_POSITION_KEY))
      .limit(1);
    return row ? row.value : null;
  }

  async setCombosPosition(position: number): Promise<void> {
    await this.db
      .insert(catalogLayout)
      .values({ key: COMBOS_POSITION_KEY, value: position })
      .onConflictDoUpdate({ target: catalogLayout.key, set: { value: position } });
  }
}
