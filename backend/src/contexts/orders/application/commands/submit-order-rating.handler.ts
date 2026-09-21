import { Inject, Injectable } from "@nestjs/common";
import { OrderRating } from "../../domain/order-rating.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { ORDER_RATING_REPOSITORY, type OrderRatingRepositoryPort } from "../../domain/ports/order-rating-repository.port";
import { InvalidRatingTokenError } from "../../domain/errors";

export interface SubmitOrderRatingCommand {
  orderId: string;
  token: string | undefined;
  stars: number;
  comment?: string | null;
}

// POST /api/order-ratings/:orderId - إنشاء/تحديث التقييم عبر اللينك العام. الـupsert في
// KyselyOrderRatingRepository هو اللي بيضمن "تقييم واحد بس لكل طلب" - إعادة الإرسال بنفس اللينك بتحدّث
// نفس الصف مش تنشئ واحد جديد
@Injectable()
export class SubmitOrderRatingHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(ORDER_RATING_REPOSITORY) private readonly ratings: OrderRatingRepositoryPort
  ) {}

  async execute(command: SubmitOrderRatingCommand): Promise<void> {
    const order = await this.orders.findById(command.orderId);
    if (!order || !command.token || order.ratingToken !== command.token) throw new InvalidRatingTokenError();

    const rating = OrderRating.submit({
      orderId: order.id,
      branchId: order.branchId,
      stars: command.stars,
      comment: command.comment,
    });
    await this.ratings.upsert(rating);
  }
}
