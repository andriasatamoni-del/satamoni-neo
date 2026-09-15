import { randomUUID } from "node:crypto";
import { InvalidUnitError, UnknownItemTypeError, UnknownNegativeStockPolicyError } from "./errors";

export const ITEM_TYPES = ["raw", "manufactured"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const NEGATIVE_STOCK_POLICIES = ["STRICT", "ALLOW_WITH_APPROVAL"] as const;
export type NegativeStockPolicy = (typeof NEGATIVE_STOCK_POLICIES)[number];

export interface InventoryItemProps {
  name: string;
  unit: string;
  unitCost: number | null;
  itemType: ItemType;
  negativeStockPolicy: NegativeStockPolicy;
  legacyInventoryItemId: number | null;
  createdAt: Date;
}

// InventoryItem - نفس مفهوم inventory_items في الريبو القديم بالظبط، بما في ذلك سياسة الرصيد السالب
// (negative_stock_policy) اللي هي القاعدة الأهم في المخزون كله. مش متضاف allow_negative_stock (عمود
// قديم "مش مستخدم في الكود الجديد" حسب تعليق الريبو القديم نفسه - تنضيف حقيقي، مش حذف خطأ).
export class InventoryItem {
  private constructor(
    public readonly id: string,
    private props: InventoryItemProps
  ) {}

  static register(input: {
    name: string;
    unit: string;
    unitCost?: number | null;
    itemType?: string;
    negativeStockPolicy?: string;
    legacyInventoryItemId?: number | null;
  }): InventoryItem {
    const name = input.name.trim();
    const unit = input.unit.trim();
    if (!unit) throw new InvalidUnitError();

    const itemType = input.itemType ?? "raw";
    if (!ITEM_TYPES.includes(itemType as ItemType)) throw new UnknownItemTypeError(itemType);

    const negativeStockPolicy = input.negativeStockPolicy ?? "STRICT";
    if (!NEGATIVE_STOCK_POLICIES.includes(negativeStockPolicy as NegativeStockPolicy)) {
      throw new UnknownNegativeStockPolicyError(negativeStockPolicy);
    }

    return new InventoryItem(randomUUID(), {
      name,
      unit,
      unitCost: input.unitCost ?? null,
      itemType: itemType as ItemType,
      negativeStockPolicy: negativeStockPolicy as NegativeStockPolicy,
      legacyInventoryItemId: input.legacyInventoryItemId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: InventoryItemProps): InventoryItem {
    return new InventoryItem(id, props);
  }

  changeNegativeStockPolicy(policy: string): void {
    if (!NEGATIVE_STOCK_POLICIES.includes(policy as NegativeStockPolicy)) {
      throw new UnknownNegativeStockPolicyError(policy);
    }
    this.props.negativeStockPolicy = policy as NegativeStockPolicy;
  }

  updateUnitCost(unitCost: number | null): void {
    this.props.unitCost = unitCost;
  }

  get name(): string { return this.props.name; }
  get unit(): string { return this.props.unit; }
  get unitCost(): number | null { return this.props.unitCost; }
  get itemType(): ItemType { return this.props.itemType; }
  get negativeStockPolicy(): NegativeStockPolicy { return this.props.negativeStockPolicy; }
  get legacyInventoryItemId(): number | null { return this.props.legacyInventoryItemId; }
  get createdAt(): Date { return this.props.createdAt; }
}
