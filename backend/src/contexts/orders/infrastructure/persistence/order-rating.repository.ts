import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { OrderRating } from "../../domain/order-rating.aggregate";
import type { OrderRatingRepositoryPort } from "../../domain/ports/order-rating-repository.port";
import { orderRatings } from "./orders.tables";

@Injectable()
export class OrderRatingRepository implements OrderRatingRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async upsert(rating: OrderRating): Promise<OrderRating> {
    const [row] = await this.db
      .insert(orderRatings)
      .values({
        id: rating.id,
        order_id: rating.orderId,
        branch_id: rating.branchId,
        stars: rating.stars,
        comment: rating.comment,
        created_at: rating.createdAt,
        updated_at: rating.updatedAt,
      })
      .onConflictDoUpdate({
        target: orderRatings.order_id,
        set: { stars: rating.stars, comment: rating.comment, updated_at: rating.updatedAt },
      })
      .returning();

    return this.toDomain(row);
  }

  async findByOrderId(orderId: string): Promise<OrderRating | null> {
    const [row] = await this.db.select().from(orderRatings).where(eq(orderRatings.order_id, orderId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: typeof orderRatings.$inferSelect): OrderRating {
    return OrderRating.reconstitute(row.id, {
      orderId: row.order_id,
      branchId: row.branch_id,
      stars: row.stars,
      comment: row.comment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
