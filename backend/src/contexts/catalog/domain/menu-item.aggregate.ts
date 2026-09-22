import { randomUUID } from "node:crypto";
import {
  DuplicateModifierNameError,
  DuplicateVariantLabelError,
  MenuItemNameRequiredError,
  ModifierNotFoundError,
  VariantNotFoundError,
} from "./errors";

export interface MenuItemVariant {
  id: string;
  label: string;
  price: number;
  talabatPrice: number | null;
  legacyVariantId: number | null;
}

export interface MenuItemModifierVariantPrice {
  variantId: string;
  priceDelta: number;
}

export interface MenuItemModifier {
  id: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
  variantPrices: MenuItemModifierVariantPrice[];
  legacyModifierId: number | null;
}

export interface MenuItemProps {
  categoryId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isBest: boolean;
  isActive: boolean;
  variants: MenuItemVariant[];
  modifiers: MenuItemModifier[];
  legacyMenuItemId: number | null;
  createdAt: Date;
  // توجيه الطباعة (TIER3-4) - محطة التحضير بتاعة الصنف نفسه؛ لو NULL بيرجع لتوجيه القسم (categoryId's
  // station) بدل ما يبقى مفيش توجيه خالص. نفس مفهوم menu_items.station_id في الريبو القديم بالظبط
  stationId: string | null;
}

// MenuItem - نفس مفهوم menu_items في الريبو القديم، بس هنا الأحجام (variants) والمرفقات (modifiers) جزء
// من نفس الـaggregate (entities تابعة، مالهاش دورة حياة مستقلة عن الصنف) بدل جداول منفصلة بتتقرا/تتحدّث
// لوحدها - أي تعديل بيعدّي من الصنف نفسه، نفس مبدأ DDD aggregate boundary. مش متضاف هنا: الكومبوهات
// وسجل تاريخ الأسعار - مؤجلين لسلايس تاني (راجع خطة إعادة البناء).
export class MenuItem {
  private constructor(
    public readonly id: string,
    private props: MenuItemProps
  ) {}

  static register(input: {
    categoryId?: string | null;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    isBest?: boolean;
    legacyMenuItemId?: number | null;
  }): MenuItem {
    const name = input.name.trim();
    if (!name) throw new MenuItemNameRequiredError();

    return new MenuItem(randomUUID(), {
      categoryId: input.categoryId ?? null,
      name,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      isBest: !!input.isBest,
      isActive: true,
      variants: [],
      modifiers: [],
      legacyMenuItemId: input.legacyMenuItemId ?? null,
      createdAt: new Date(),
      stationId: null,
    });
  }

  static reconstitute(id: string, props: MenuItemProps): MenuItem {
    return new MenuItem(id, props);
  }

  addVariant(input: { label: string; price: number; talabatPrice?: number | null; legacyVariantId?: number | null }): MenuItemVariant {
    const label = input.label.trim();
    if (this.props.variants.some((v) => v.label === label)) throw new DuplicateVariantLabelError(label);
    const variant: MenuItemVariant = {
      id: randomUUID(),
      label,
      price: input.price,
      talabatPrice: input.talabatPrice ?? null,
      legacyVariantId: input.legacyVariantId ?? null,
    };
    this.props.variants.push(variant);
    return variant;
  }

  updateVariantPrice(variantId: string, price: number, talabatPrice?: number | null): void {
    const variant = this.props.variants.find((v) => v.id === variantId);
    if (!variant) throw new VariantNotFoundError();
    variant.price = price;
    if (talabatPrice !== undefined) variant.talabatPrice = talabatPrice;
  }

  addModifier(input: { name: string; priceDelta: number; legacyModifierId?: number | null }): MenuItemModifier {
    const name = input.name.trim();
    if (this.props.modifiers.some((m) => m.name === name)) throw new DuplicateModifierNameError(name);
    const modifier: MenuItemModifier = {
      id: randomUUID(),
      name,
      priceDelta: input.priceDelta,
      isActive: true,
      variantPrices: [],
      legacyModifierId: input.legacyModifierId ?? null,
    };
    this.props.modifiers.push(modifier);
    return modifier;
  }

  updateModifier(modifierId: string, input: { name?: string; priceDelta?: number; isActive?: boolean }): void {
    const modifier = this.props.modifiers.find((m) => m.id === modifierId);
    if (!modifier) throw new ModifierNotFoundError();
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (this.props.modifiers.some((m) => m.id !== modifierId && m.name === name)) throw new DuplicateModifierNameError(name);
      modifier.name = name;
    }
    if (input.priceDelta !== undefined) modifier.priceDelta = input.priceDelta;
    if (input.isActive !== undefined) modifier.isActive = input.isActive;
  }

  // سعر مخصوص للمرفق ده على حجم معيّن من نفس الصنف - بيغلب السعر الافتراضي (priceDelta) بس لما العميل
  // يختار الحجم ده بالظبط (راجع resolveModifierPrice). مفيش تحقق إن variantId فعلًا حجم تابع لنفس
  // الصنف هنا عمدًا - التحقق ده مسؤولية الـapplication layer (بيحتاج يقرا variants أصلًا عشان يلاقي
  // الحجم المطلوب، فمفيش داعي يتكرر جوّه الـaggregate)
  setModifierVariantPrice(modifierId: string, variantId: string, priceDelta: number): void {
    const modifier = this.props.modifiers.find((m) => m.id === modifierId);
    if (!modifier) throw new ModifierNotFoundError();
    const existing = modifier.variantPrices.find((vp) => vp.variantId === variantId);
    if (existing) existing.priceDelta = priceDelta;
    else modifier.variantPrices.push({ variantId, priceDelta });
  }

  clearModifierVariantPrice(modifierId: string, variantId: string): void {
    const modifier = this.props.modifiers.find((m) => m.id === modifierId);
    if (!modifier) throw new ModifierNotFoundError();
    modifier.variantPrices = modifier.variantPrices.filter((vp) => vp.variantId !== variantId);
  }

  // السعر الفعلي لمرفق على حجم معيّن - سعر مخصوص للحجم ده لو موجود، وإلا السعر الافتراضي. نفس منطق
  // الريبو القديم بالظبط (LEFT JOIN menu_item_modifier_variant_prices، fallback للسعر الافتراضي)
  resolveModifierPrice(modifierId: string, variantId: string): number {
    const modifier = this.props.modifiers.find((m) => m.id === modifierId);
    if (!modifier) throw new ModifierNotFoundError();
    const override = modifier.variantPrices.find((vp) => vp.variantId === variantId);
    return override ? override.priceDelta : modifier.priceDelta;
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
    if (input.categoryId !== undefined) this.props.categoryId = input.categoryId;
    if (input.description !== undefined) this.props.description = input.description;
    if (input.imageUrl !== undefined) this.props.imageUrl = input.imageUrl;
    if (input.isBest !== undefined) this.props.isBest = input.isBest;
  }

  activate(): void { this.props.isActive = true; }
  deactivate(): void { this.props.isActive = false; }
  setStationId(stationId: string | null): void { this.props.stationId = stationId; }

  get categoryId(): string | null { return this.props.categoryId; }
  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get imageUrl(): string | null { return this.props.imageUrl; }
  get isBest(): boolean { return this.props.isBest; }
  get isActive(): boolean { return this.props.isActive; }
  get variants(): readonly MenuItemVariant[] { return this.props.variants; }
  get modifiers(): readonly MenuItemModifier[] { return this.props.modifiers; }
  get legacyMenuItemId(): number | null { return this.props.legacyMenuItemId; }
  get createdAt(): Date { return this.props.createdAt; }
  get stationId(): string | null { return this.props.stationId; }
}
