import { randomUUID } from "node:crypto";
import { InvalidLoyaltyRewardError } from "./errors";

export const LOYALTY_REWARD_KINDS = ["discount", "free_item", "free_combo"] as const;
export type LoyaltyRewardKind = (typeof LOYALTY_REWARD_KINDS)[number];

export interface LoyaltyRewardProps {
  name: string;
  description: string | null;
  imageUrl: string | null;
  pointsCost: number;
  kind: LoyaltyRewardKind;
  // خصم بمبلغ ثابت على الطلب
  discountAmount: number | null;
  // صنف هدية (حجم معيّن - "بيتزا وسط هدية") أو عرض هدية
  variantId: string | null;
  comboId: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface LoyaltyRewardInput {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  pointsCost: number;
  kind: string;
  discountAmount?: number | null;
  variantId?: string | null;
  comboId?: string | null;
  isActive?: boolean;
}

// مكافأة في كتالوج نقاط الولاء (STORE-2) - الإدارة بتحددها، والعميل بيصرف نقاطه في واحدة وهو بيطلب.
// نفس قيد loyalty_rewards_kind_target في القاعدة: كل نوع بهدفه بس (مبلغ / حجم / عرض)
export class LoyaltyReward {
  private constructor(
    public readonly id: string,
    private props: LoyaltyRewardProps
  ) {}

  static register(input: LoyaltyRewardInput): LoyaltyReward {
    return new LoyaltyReward(randomUUID(), { ...LoyaltyReward.validate(input), createdAt: new Date() });
  }

  static reconstitute(id: string, props: LoyaltyRewardProps): LoyaltyReward {
    return new LoyaltyReward(id, props);
  }

  update(input: LoyaltyRewardInput): void {
    this.props = { ...LoyaltyReward.validate(input), createdAt: this.props.createdAt };
  }

  private static validate(input: LoyaltyRewardInput): Omit<LoyaltyRewardProps, "createdAt"> {
    const name = (input.name ?? "").trim();
    if (!name) throw new InvalidLoyaltyRewardError("لازم اسم للمكافأة");
    if (!Number.isInteger(input.pointsCost) || input.pointsCost <= 0) {
      throw new InvalidLoyaltyRewardError("عدد النقاط لازم رقم صحيح أكبر من صفر");
    }
    if (!LOYALTY_REWARD_KINDS.includes(input.kind as LoyaltyRewardKind)) {
      throw new InvalidLoyaltyRewardError("نوع المكافأة لازم خصم أو صنف هدية أو عرض هدية");
    }
    const kind = input.kind as LoyaltyRewardKind;
    let discountAmount: number | null = null;
    let variantId: string | null = null;
    let comboId: string | null = null;
    if (kind === "discount") {
      if (!input.discountAmount || input.discountAmount <= 0) throw new InvalidLoyaltyRewardError("لازم مبلغ الخصم");
      discountAmount = Math.round(input.discountAmount * 100) / 100;
    } else if (kind === "free_item") {
      if (!input.variantId) throw new InvalidLoyaltyRewardError("اختار الصنف والحجم الهدية");
      variantId = input.variantId;
    } else {
      if (!input.comboId) throw new InvalidLoyaltyRewardError("اختار العرض الهدية");
      comboId = input.comboId;
    }
    return {
      name,
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      pointsCost: input.pointsCost,
      kind,
      discountAmount,
      variantId,
      comboId,
      isActive: input.isActive ?? true,
    };
  }

  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get imageUrl(): string | null { return this.props.imageUrl; }
  get pointsCost(): number { return this.props.pointsCost; }
  get kind(): LoyaltyRewardKind { return this.props.kind; }
  get discountAmount(): number | null { return this.props.discountAmount; }
  get variantId(): string | null { return this.props.variantId; }
  get comboId(): string | null { return this.props.comboId; }
  get isActive(): boolean { return this.props.isActive; }
  get createdAt(): Date { return this.props.createdAt; }
}
