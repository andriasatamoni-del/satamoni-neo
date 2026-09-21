import { randomUUID } from "node:crypto";
import { MenuCategoryNameRequiredError } from "./errors";

export const MENU_GROUPS = ["regular", "fasting"] as const;
export type MenuGroup = (typeof MENU_GROUPS)[number];

export interface MenuCategoryProps {
  name: string;
  displayOrder: number;
  menuGroup: MenuGroup;
  isActive: boolean;
  legacyCategoryId: number | null;
  // توجيه الطباعة (TIER3-4) - محطة التحضير الافتراضية لكل أصناف القسم؛ توجيه مستوى الصنف (MenuItem.stationId)
  // بيغلبها لو الاتنين متسجلين. نفس مفهوم menu_categories.station_id في الريبو القديم بالظبط
  stationId: string | null;
}

// MenuCategory - نفس مفهوم menu_categories في الريبو القديم
export class MenuCategory {
  private constructor(
    public readonly id: string,
    private props: MenuCategoryProps
  ) {}

  static register(input: {
    name: string;
    displayOrder?: number;
    menuGroup?: string;
    legacyCategoryId?: number | null;
  }): MenuCategory {
    const name = input.name.trim();
    if (!name) throw new MenuCategoryNameRequiredError();

    return new MenuCategory(randomUUID(), {
      name,
      displayOrder: input.displayOrder ?? 0,
      menuGroup: (input.menuGroup as MenuGroup) ?? "regular",
      isActive: true,
      legacyCategoryId: input.legacyCategoryId ?? null,
      stationId: null,
    });
  }

  static reconstitute(id: string, props: MenuCategoryProps): MenuCategory {
    return new MenuCategory(id, props);
  }

  activate(): void { this.props.isActive = true; }
  deactivate(): void { this.props.isActive = false; }
  setStationId(stationId: string | null): void { this.props.stationId = stationId; }

  get name(): string { return this.props.name; }
  get displayOrder(): number { return this.props.displayOrder; }
  get menuGroup(): MenuGroup { return this.props.menuGroup; }
  get isActive(): boolean { return this.props.isActive; }
  get legacyCategoryId(): number | null { return this.props.legacyCategoryId; }
  get stationId(): string | null { return this.props.stationId; }
}
