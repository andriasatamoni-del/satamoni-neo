import { randomUUID } from "node:crypto";
import { ComboMissingItemsError, ComboNameRequiredError, DuplicateComboItemError, InvalidComboItemError } from "./errors";

export interface ComboItem {
  id: string;
  variantId: string;
  quantity: number;
  parentItemId: string | null;
}

export interface ComboItemInput {
  variantId: string;
  quantity?: number;
  addons?: { variantId: string; quantity?: number }[];
}

export interface ComboComponent {
  variantId: string;
  quantity: number;
}

export interface ComboProps {
  name: string;
  price: number;
  isActive: boolean;
  // صورة ووصف للعرض على موقع الطلب (STORE-2)
  imageUrl: string | null;
  description: string | null;
  // عرض حصري للموقع: مايظهرش في الكاشير ولا البوت، وبيتقبل في طلبات الموقع بس
  onlineOnly: boolean;
  items: ComboItem[];
  legacyComboId: number | null;
  createdAt: Date;
}

function buildItem(input: { variantId: string; quantity?: number }, parentItemId: string | null): ComboItem {
  if (!input.variantId || (input.quantity !== undefined && input.quantity <= 0)) throw new InvalidComboItemError();
  return { id: randomUUID(), variantId: input.variantId, quantity: input.quantity ?? 1, parentItemId };
}

function assertNoRepeats(variantIds: string[]): void {
  if (new Set(variantIds).size !== variantIds.length) throw new DuplicateComboItemError();
}

function buildItems(items: ComboItemInput[]): ComboItem[] {
  if (items.length === 0) throw new ComboMissingItemsError();
  assertNoRepeats(items.map((it) => it.variantId));
  return items.flatMap((it) => {
    const parent = buildItem(it, null);
    const addons = it.addons ?? [];
    assertNoRepeats(addons.map((addon) => addon.variantId));
    return [parent, ...addons.map((addon) => buildItem(addon, parent.id))];
  });
}

// Combo - نفس مفهوم combos+combo_items في الريبو القديم: عرض بيجمع أكتر من صنف (حجم) بسعر واحد مختلف
// عن مجموع أسعار الأصناف. استهلاك المخزون (عن طريق وصفة كل حجم داخل العرض) بيحصل في الـapplication
// layer وقت تسجيل الطلب (RegisterOrderHandler) بالظبط زي الأصناف العادية - الدومين هنا مسؤول بس عن
// شكل/قواعد العرض نفسه.
export class Combo {
  private constructor(
    public readonly id: string,
    private props: ComboProps
  ) {}

  static register(input: {
    name: string;
    price: number;
    items: ComboItemInput[];
    imageUrl?: string | null;
    description?: string | null;
    onlineOnly?: boolean;
    legacyComboId?: number | null;
  }): Combo {
    const name = input.name.trim();
    if (!name) throw new ComboNameRequiredError();

    return new Combo(randomUUID(), {
      name,
      price: input.price,
      isActive: true,
      imageUrl: input.imageUrl?.trim() || null,
      description: input.description?.trim() || null,
      onlineOnly: !!input.onlineOnly,
      items: buildItems(input.items),
      legacyComboId: input.legacyComboId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ComboProps): Combo {
    return new Combo(id, props);
  }

  updateDetails(input: {
    name?: string;
    price?: number;
    isActive?: boolean;
    imageUrl?: string | null;
    description?: string | null;
    onlineOnly?: boolean;
  }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ComboNameRequiredError();
      this.props.name = name;
    }
    if (input.price !== undefined) this.props.price = input.price;
    if (input.isActive !== undefined) this.props.isActive = input.isActive;
    if (input.imageUrl !== undefined) this.props.imageUrl = input.imageUrl?.trim() || null;
    if (input.description !== undefined) this.props.description = input.description?.trim() || null;
    if (input.onlineOnly !== undefined) this.props.onlineOnly = input.onlineOnly;
  }

  replaceItems(items: ComboItemInput[]): void {
    this.props.items = buildItems(items);
  }

  get name(): string { return this.props.name; }
  get price(): number { return this.props.price; }
  get isActive(): boolean { return this.props.isActive; }
  get imageUrl(): string | null { return this.props.imageUrl; }
  get description(): string | null { return this.props.description; }
  get onlineOnly(): boolean { return this.props.onlineOnly; }
  get items(): readonly ComboItem[] { return this.props.items; }
  get mainItems(): readonly ComboItem[] { return this.props.items.filter((item) => item.parentItemId === null); }
  addonsOf(itemId: string): readonly ComboItem[] { return this.props.items.filter((item) => item.parentItemId === itemId); }

  get components(): ComboComponent[] {
    return this.mainItems.flatMap((item) => [
      { variantId: item.variantId, quantity: item.quantity },
      ...this.addonsOf(item.id).map((addon) => ({ variantId: addon.variantId, quantity: addon.quantity * item.quantity })),
    ]);
  }
  get legacyComboId(): number | null { return this.props.legacyComboId; }
  get createdAt(): Date { return this.props.createdAt; }
}
