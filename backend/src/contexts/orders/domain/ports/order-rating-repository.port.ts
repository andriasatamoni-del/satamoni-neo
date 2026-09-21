import type { OrderRating } from "../order-rating.aggregate";

export interface OrderRatingRepositoryPort {
  // upsert على order_id - نفس ON CONFLICT (order_id) DO UPDATE في الريبو القديم بالظبط
  upsert(rating: OrderRating): Promise<OrderRating>;
  findByOrderId(orderId: string): Promise<OrderRating | null>;
}

export const ORDER_RATING_REPOSITORY = Symbol("ORDER_RATING_REPOSITORY");
