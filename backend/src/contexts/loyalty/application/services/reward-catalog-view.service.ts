import { Inject, Injectable } from "@nestjs/common";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../../catalog/domain/ports/combo-repository.port";
import type { LoyaltyReward } from "../../domain/loyalty-reward.aggregate";

export interface RewardView {
  id: string;
  name: string;
  description: string | null;
  // صورة المكافأة نفسها، أو صورة الصنف/العرض الهدية لو مالهاش صورة
  imageUrl: string | null;
  pointsCost: number;
  kind: string;
  discountAmount: number | null;
  variantId: string | null;
  comboId: string | null;
  // "بيتزا مارجريتا (وسط)" / اسم العرض - للعرض على الموقع وشاشة الإدارة
  targetName: string | null;
  // قيمة الهدية بسعر المنيو الحالي (بتتخصم من الطلب)، أو مبلغ الخصم
  value: number | null;
  isActive: boolean;
}

// عرض المكافآت بأسماء وأسعار الأصناف/العروض الحالية من Catalog - الأسعار مش متخزّنة في المكافأة، عشان
// لو سعر البيتزا اتغيّر الهدية تفضل هي هي (والخصم بيطلع بسعرها وقت الطلب)
@Injectable()
export class RewardCatalogViewService {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort,
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort
  ) {}

  async view(reward: LoyaltyReward): Promise<RewardView> {
    let targetName: string | null = null;
    let value: number | null = reward.discountAmount;
    let targetImage: string | null = null;
    let available = true;
    if (reward.variantId) {
      const item = await this.menuItems.findByVariantId(reward.variantId);
      const variant = item?.variants.find((v) => v.id === reward.variantId);
      targetName = item && variant ? (item.variants.length > 1 ? `${item.name} (${variant.label})` : item.name) : null;
      value = variant?.price ?? null;
      targetImage = item?.imageUrl ?? null;
      available = !!item?.isActive && !!variant;
    } else if (reward.comboId) {
      const combo = await this.combos.findById(reward.comboId);
      targetName = combo?.name ?? null;
      value = combo?.price ?? null;
      targetImage = combo?.imageUrl ?? null;
      available = !!combo?.isActive;
    }
    return {
      id: reward.id,
      name: reward.name,
      description: reward.description,
      imageUrl: reward.imageUrl ?? targetImage,
      pointsCost: reward.pointsCost,
      kind: reward.kind,
      discountAmount: reward.discountAmount,
      variantId: reward.variantId,
      comboId: reward.comboId,
      targetName,
      value,
      // مكافأة صنفها اتوقف من المنيو بتختفي من الموقع لوحدها
      isActive: reward.isActive && available,
    };
  }

  async viewAll(rewards: LoyaltyReward[]): Promise<RewardView[]> {
    return Promise.all(rewards.map((r) => this.view(r)));
  }
}
