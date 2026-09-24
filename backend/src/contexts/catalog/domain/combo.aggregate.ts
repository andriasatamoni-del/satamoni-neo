import { randomUUID } from "node:crypto";
import { ComboMissingItemsError, ComboNameRequiredError, InvalidComboItemError } from "./errors";

export interface ComboItem {
  id: string;
  variantId: string;
  quantity: number;
}

export interface ComboProps {
  name: string;
  price: number;
  isActive: boolean;
  items: ComboItem[];
  legacyComboId: number | null;
  createdAt: Date;
}

function buildItems(items: { variantId: string; quantity?: number }[]): ComboItem[] {
  if (items.length === 0) throw new ComboMissingItemsError();
  return items.map((it) => {
    if (!it.variantId || (it.quantity !== undefined && it.quantity <= 0)) throw new InvalidComboItemError();
    return { id: randomUUID(), variantId: it.variantId, quantity: it.quantity ?? 1 };
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
    items: { variantId: string; quantity?: number }[];
    legacyComboId?: number | null;
  }): Combo {
    const name = input.name.trim();
    if (!name) throw new ComboNameRequiredError();

    return new Combo(randomUUID(), {
      name,
      price: input.price,
      isActive: true,
      items: buildItems(input.items),
      legacyComboId: input.legacyComboId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ComboProps): Combo {
    return new Combo(id, props);
  }

  updateDetails(input: { name?: string; price?: number; isActive?: boolean }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ComboNameRequiredError();
      this.props.name = name;
    }
    if (input.price !== undefined) this.props.price = input.price;
    if (input.isActive !== undefined) this.props.isActive = input.isActive;
  }

  replaceItems(items: { variantId: string; quantity?: number }[]): void {
    this.props.items = buildItems(items);
  }

  get name(): string { return this.props.name; }
  get price(): number { return this.props.price; }
  get isActive(): boolean { return this.props.isActive; }
  get items(): readonly ComboItem[] { return this.props.items; }
  get legacyComboId(): number | null { return this.props.legacyComboId; }
  get createdAt(): Date { return this.props.createdAt; }
}
