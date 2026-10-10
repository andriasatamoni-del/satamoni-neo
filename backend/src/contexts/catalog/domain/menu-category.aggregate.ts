import { randomUUID } from "node:crypto";
import { MenuCategoryArchivedError, MenuCategoryNameRequiredError, MenuCategoryNotArchivedError } from "./errors";

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
  // أرشفة بدل الحذف: القسم بيختفي من الشاشات والإعدادات، والأصناف والطلبات القديمة مبتتلمسش (الأرشفة بتوقفه كمان)
  archivedAt: Date | null;
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
      archivedAt: null,
    });
  }

  static reconstitute(id: string, props: MenuCategoryProps): MenuCategory {
    return new MenuCategory(id, props);
  }

  activate(): void {
    if (this.props.archivedAt) throw new MenuCategoryArchivedError();
    this.props.isActive = true;
  }
  deactivate(): void { this.props.isActive = false; }
  // الأرشفة بتوقف القسم كمان (is_active=false) فكل مكان بيفلتر على النشط (الكاشير، المتجر، البوت) بيخفيه من غير تعديل
  archive(now: Date = new Date()): void {
    if (this.props.archivedAt) throw new MenuCategoryArchivedError();
    this.props.archivedAt = now;
    this.props.isActive = false;
  }

  // الاسترجاع بيرجّع القسم **موقوف** - تفعيله بعد كده قرار صريح منك
  restore(): void {
    if (!this.props.archivedAt) throw new MenuCategoryNotArchivedError();
    this.props.archivedAt = null;
  }

  setStationId(stationId: string | null): void { this.props.stationId = stationId; }

  updateDetails(input: { name?: string; displayOrder?: number; menuGroup?: string }): void {
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new MenuCategoryNameRequiredError();
      this.props.name = trimmed;
    }
    if (input.displayOrder !== undefined) this.props.displayOrder = input.displayOrder;
    if (input.menuGroup !== undefined) this.props.menuGroup = input.menuGroup as MenuGroup;
  }

  get name(): string { return this.props.name; }
  get displayOrder(): number { return this.props.displayOrder; }
  get menuGroup(): MenuGroup { return this.props.menuGroup; }
  get isActive(): boolean { return this.props.isActive; }
  get archivedAt(): Date | null { return this.props.archivedAt; }
  get isArchived(): boolean { return this.props.archivedAt !== null; }
  get legacyCategoryId(): number | null { return this.props.legacyCategoryId; }
  get stationId(): string | null { return this.props.stationId; }
}
