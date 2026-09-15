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
    });
  }

  static reconstitute(id: string, props: MenuCategoryProps): MenuCategory {
    return new MenuCategory(id, props);
  }

  activate(): void { this.props.isActive = true; }
  deactivate(): void { this.props.isActive = false; }

  get name(): string { return this.props.name; }
  get displayOrder(): number { return this.props.displayOrder; }
  get menuGroup(): MenuGroup { return this.props.menuGroup; }
  get isActive(): boolean { return this.props.isActive; }
  get legacyCategoryId(): number | null { return this.props.legacyCategoryId; }
}
