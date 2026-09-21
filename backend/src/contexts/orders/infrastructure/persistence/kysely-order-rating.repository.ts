import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { OrderRating } from "../../domain/order-rating.aggregate";
import type { OrderRatingRepositoryPort } from "../../domain/ports/order-rating-repository.port";

@Injectable()
export class KyselyOrderRatingRepository implements OrderRatingRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async upsert(rating: OrderRating): Promise<OrderRating> {
    const row = await this.db
      .insertInto("order_ratings")
      .values({
        id: rating.id,
        order_id: rating.orderId,
        branch_id: rating.branchId,
        stars: rating.stars,
        comment: rating.comment,
        created_at: rating.createdAt,
        updated_at: rating.updatedAt,
      })
      .onConflict((oc) =>
        oc.column("order_id").doUpdateSet({
          stars: rating.stars,
          comment: rating.comment,
          updated_at: rating.updatedAt,
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return OrderRating.reconstitute(row.id, {
      orderId: row.order_id,
      branchId: row.branch_id,
      stars: row.stars,
      comment: row.comment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async findByOrderId(orderId: string): Promise<OrderRating | null> {
    const row = await this.db.selectFrom("order_ratings").selectAll().where("order_id", "=", orderId).executeTakeFirst();
    if (!row) return null;
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
