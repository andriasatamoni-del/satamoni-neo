import { Inject, Injectable } from "@nestjs/common";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { ORDER_RATING_REPOSITORY, type OrderRatingRepositoryPort } from "../../domain/ports/order-rating-repository.port";
import { InvalidRatingTokenError } from "../../domain/errors";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../../branches/domain/ports/branch-repository.port";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../../catalog/domain/ports/menu-item-repository.port";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../../catalog/domain/ports/combo-repository.port";

export interface GetPublicOrderRatingQuery {
  orderId: string;
  token: string | undefined;
}

export interface PublicOrderRatingView {
  orderId: string;
  branchName: string | null;
  orderType: string;
  createdAt: Date;
  items: { name: string; variant: string | null; quantity: number }[];
  existingRating: { stars: number; comment: string | null } | null;
}

// GET /api/order-ratings/:orderId?token=... - نفس رد الريبو القديم بالظبط (routes/order-ratings.js):
// توكن غلط أو مطابق لطلب تاني -> نفس الخطأ الموحّد (InvalidRatingTokenError، 404) عشان محدش يقدر
// يشوف طلب مش بتاعه بمجرد تخمين رقم الطلب
@Injectable()
export class GetPublicOrderRatingHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(ORDER_RATING_REPOSITORY) private readonly ratings: OrderRatingRepositoryPort,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort,
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort
  ) {}

  async execute(query: GetPublicOrderRatingQuery): Promise<PublicOrderRatingView> {
    const order = await this.orders.findById(query.orderId);
    if (!order || !query.token || order.ratingToken !== query.token) throw new InvalidRatingTokenError();

    const branch = await this.branches.findById(order.branchId);
    const items = [];
    for (const line of order.items) {
      if (line.comboId) {
        const combo = await this.combos.findById(line.comboId);
        items.push({ name: combo?.name ?? "عرض", variant: null, quantity: line.quantity });
        continue;
      }
      const menuItem = await this.menuItems.findByVariantId(line.variantId!);
      const variant = menuItem?.variants.find((v) => v.id === line.variantId);
      items.push({ name: menuItem?.name ?? "صنف", variant: variant?.label ?? null, quantity: line.quantity });
    }
    const existing = await this.ratings.findByOrderId(order.id);

    return {
      orderId: order.id,
      branchName: branch?.name ?? null,
      orderType: order.orderType,
      createdAt: order.createdAt,
      items,
      existingRating: existing ? { stars: existing.stars, comment: existing.comment } : null,
    };
  }
}
