import { Inject, Injectable } from "@nestjs/common";
import {
  CATALOG_LAYOUT_REPOSITORY,
  MENU_CATEGORY_REPOSITORY,
  type CatalogLayoutRepositoryPort,
  type MenuCategoryRepositoryPort,
} from "../../domain/ports/menu-category-repository.port";
import { InvalidCategoryOrderError } from "../../domain/errors";
import type { MenuCategory } from "../../domain/menu-category.aggregate";

export const COMBOS_TOKEN = "combos";

export interface ReorderCategoriesCommand {
  // معرّفات الأقسام بالترتيب المطلوب + الكلمة "combos" لمكان تبويب العروض
  order: string[];
}

// ترتيب عرض الأقسام (والعروض وسطها). أي قسم غير مذكور بيتحط بعد المذكورين بترتيبه الحالي، فإضافة قسم أثناء الترتيب متضيعش.
// الأقسام المؤرشفة مش بتدخل الترتيب.
@Injectable()
export class ReorderMenuCategoriesHandler {
  constructor(
    @Inject(MENU_CATEGORY_REPOSITORY) private readonly categories: MenuCategoryRepositoryPort,
    @Inject(CATALOG_LAYOUT_REPOSITORY) private readonly layout: CatalogLayoutRepositoryPort
  ) {}

  async execute(command: ReorderCategoriesCommand): Promise<{ categories: MenuCategory[]; combosPosition: number | null }> {
    const visible = await this.categories.list({ archived: false });
    const byId = new Map(visible.map((c) => [c.id, c]));

    const seen = new Set<string>();
    for (const token of command.order) {
      if (seen.has(token)) throw new InvalidCategoryOrderError("قسم مكرر");
      seen.add(token);
      if (token !== COMBOS_TOKEN && !byId.has(token)) throw new InvalidCategoryOrderError("قسم مش موجود أو مؤرشف");
    }

    const sequence = [...command.order, ...visible.filter((c) => !seen.has(c.id)).map((c) => c.id)];
    let combosPosition: number | null = null;
    for (const [index, token] of sequence.entries()) {
      if (token === COMBOS_TOKEN) {
        combosPosition = index;
        continue;
      }
      const category = byId.get(token)!;
      if (category.displayOrder !== index) {
        category.updateDetails({ displayOrder: index });
        await this.categories.save(category);
      }
    }
    if (combosPosition !== null) await this.layout.setCombosPosition(combosPosition);
    return { categories: await this.categories.list({ archived: false }), combosPosition };
  }
}
