import { randomUUID } from "node:crypto";
import {
  AddonPlacementNotAllowedError,
  AddonSingleVariantError,
  DuplicateVariantLabelError,
  MenuItemNameRequiredError,
  VariantNotFoundError,
} from "./errors";

export const MENU_ITEM_KINDS = ["item", "addon"] as const;
export type MenuItemKind = (typeof MENU_ITEM_KINDS)[number];

export interface MenuItemVariant {
  id: string;
  label: string;
  price: number;
  talabatPrice: number;
  legacyVariantId: number | null;
}

export interface MenuItemProps {
  kind: MenuItemKind;
  categoryId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isBest: boolean;
  isActive: boolean;
  variants: MenuItemVariant[];
  legacyMenuItemId: number | null;
  createdAt: Date;
  stationId: string | null;
}

export class MenuItem {
  private constructor(
    public readonly id: string,
    private props: MenuItemProps
  ) {}

  static register(input: {
    kind?: MenuItemKind;
    categoryId?: string | null;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    isBest?: boolean;
    legacyMenuItemId?: number | null;
  }): MenuItem {
    const name = input.name.trim();
    if (!name) throw new MenuItemNameRequiredError();
    const kind = input.kind ?? "item";
    const categoryId = input.categoryId ?? null;
    if (kind === "addon" && categoryId !== null) throw new AddonPlacementNotAllowedError();

    return new MenuItem(randomUUID(), {
      kind,
      categoryId,
      name,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      isBest: kind === "item" && !!input.isBest,
      isActive: true,
      variants: [],
      legacyMenuItemId: input.legacyMenuItemId ?? null,
      createdAt: new Date(),
      stationId: null,
    });
  }

  static reconstitute(id: string, props: MenuItemProps): MenuItem {
    return new MenuItem(id, props);
  }

  addVariant(input: { label: string; price: number; talabatPrice: number; legacyVariantId?: number | null }): MenuItemVariant {
    if (this.isAddon && this.props.variants.length > 0) throw new AddonSingleVariantError();
    const label = input.label.trim();
    if (this.props.variants.some((v) => v.label === label)) throw new DuplicateVariantLabelError(label);
    const variant: MenuItemVariant = {
      id: randomUUID(),
      label,
      price: input.price,
      talabatPrice: input.talabatPrice,
      legacyVariantId: input.legacyVariantId ?? null,
    };
    this.props.variants.push(variant);
    return variant;
  }

  updateVariantPrice(variantId: string, price?: number, talabatPrice?: number): void {
    const variant = this.props.variants.find((v) => v.id === variantId);
    if (!variant) throw new VariantNotFoundError();
    if (price !== undefined) variant.price = price;
    if (talabatPrice !== undefined) variant.talabatPrice = talabatPrice;
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new MenuItemNameRequiredError();
    this.props.name = trimmed;
  }

  updateDetails(input: {
    categoryId?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    isBest?: boolean;
  }): void {
    if (this.isAddon && (input.categoryId ?? null) !== null) throw new AddonPlacementNotAllowedError();
    if (input.categoryId !== undefined) this.props.categoryId = input.categoryId;
    if (input.description !== undefined) this.props.description = input.description;
    if (input.imageUrl !== undefined) this.props.imageUrl = input.imageUrl;
    if (input.isBest !== undefined) this.props.isBest = this.isItem && input.isBest;
  }

  activate(): void { this.props.isActive = true; }
  deactivate(): void { this.props.isActive = false; }

  setStationId(stationId: string | null): void {
    if (this.isAddon && stationId !== null) throw new AddonPlacementNotAllowedError();
    this.props.stationId = stationId;
  }

  get kind(): MenuItemKind { return this.props.kind; }
  get isAddon(): boolean { return this.props.kind === "addon"; }
  get isItem(): boolean { return this.props.kind === "item"; }
  get categoryId(): string | null { return this.props.categoryId; }
  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get imageUrl(): string | null { return this.props.imageUrl; }
  get isBest(): boolean { return this.props.isBest; }
  get isActive(): boolean { return this.props.isActive; }
  get variants(): readonly MenuItemVariant[] { return this.props.variants; }
  get legacyMenuItemId(): number | null { return this.props.legacyMenuItemId; }
  get createdAt(): Date { return this.props.createdAt; }
  get stationId(): string | null { return this.props.stationId; }
}
