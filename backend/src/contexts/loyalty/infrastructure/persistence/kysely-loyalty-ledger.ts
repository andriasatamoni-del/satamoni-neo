import { Inject, Injectable } from "@nestjs/common";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type { LoyaltyLedgerPort, LoyaltyTransaction, LoyaltyTransactionKind } from "../../domain/ports/loyalty-ledger.port";
import { InsufficientLoyaltyPointsError } from "../../domain/errors";

@Injectable()
export class KyselyLoyaltyLedger implements LoyaltyLedgerPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async balance(customerId: string): Promise<number> {
    const row = await this.db.selectFrom("customers").select("loyalty_points").where("id", "=", customerId).executeTakeFirst();
    return row ? Number(row.loyalty_points) : 0;
  }

  // كل عملية بتقفل صف العميل الأول (FOR UPDATE) - عمليتين على نفس العميل في نفس اللحظة بيتسلسلوا
  private async lockBalance(trx: Transaction<Database>, customerId: string): Promise<number> {
    const row = await trx.selectFrom("customers").select("loyalty_points").where("id", "=", customerId).forUpdate().executeTakeFirst();
    return row ? Number(row.loyalty_points) : 0;
  }

  private async addPoints(trx: Transaction<Database>, customerId: string, delta: number): Promise<void> {
    await trx
      .updateTable("customers")
      .set({ loyalty_points: sql`GREATEST(loyalty_points + ${delta}, 0)`, updated_at: new Date() })
      .where("id", "=", customerId)
      .execute();
  }

  async earnForOrder(customerId: string, orderId: string, points: number): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      await this.lockBalance(trx, customerId);
      const exists = await trx
        .selectFrom("loyalty_transactions")
        .select("id")
        .where("order_id", "=", orderId)
        .where("kind", "=", "earn")
        .executeTakeFirst();
      if (exists) return false;
      await trx.insertInto("loyalty_transactions").values({ customer_id: customerId, order_id: orderId, kind: "earn", points }).execute();
      await this.addPoints(trx, customerId, points);
      return true;
    });
  }

  async reserveRedemption(input: { customerId: string; requestId: string; rewardId: string; points: number; note: string }): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const balance = await this.lockBalance(trx, input.customerId);
      const existing = await trx
        .selectFrom("loyalty_transactions")
        .select("id")
        .where("request_id", "=", input.requestId)
        .executeTakeFirst();
      if (existing) return; // نفس الطلب اتبعت تاني - الحجز موجود بالفعل
      if (balance < input.points) throw new InsufficientLoyaltyPointsError(input.points, balance);
      await trx
        .insertInto("loyalty_transactions")
        .values({
          customer_id: input.customerId,
          request_id: input.requestId,
          kind: "redeem",
          points: -input.points,
          reward_id: input.rewardId,
          note: input.note,
        })
        .execute();
      await this.addPoints(trx, input.customerId, -input.points);
    });
  }

  async attachReservationToOrder(requestId: string, orderId: string): Promise<void> {
    await this.db
      .updateTable("loyalty_transactions")
      .set({ order_id: orderId })
      .where("request_id", "=", requestId)
      .where("order_id", "is", null)
      .execute();
  }

  async releaseReservation(requestId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom("loyalty_transactions")
        .select(["id", "customer_id", "points"])
        .where("request_id", "=", requestId)
        .where("order_id", "is", null)
        .executeTakeFirst();
      if (!row) return;
      await this.lockBalance(trx, row.customer_id);
      // حجز لطلب عمره ما اتسجّل - مش حركة حقيقية، بيتشال من السجل خالص
      await trx.deleteFrom("loyalty_transactions").where("id", "=", row.id).execute();
      await this.addPoints(trx, row.customer_id, -Number(row.points));
    });
  }

  async settleCancelledOrder(orderId: string): Promise<void> {
    const rows = await this.db
      .selectFrom("loyalty_transactions")
      .select(["customer_id", "kind", "points", "reward_id"])
      .where("order_id", "=", orderId)
      .execute();
    const reversals: Record<string, LoyaltyTransactionKind> = { earn: "reverse_earn", redeem: "refund_redeem" };
    for (const row of rows) {
      const reversalKind = reversals[row.kind];
      if (!reversalKind || rows.some((r) => r.kind === reversalKind)) continue;
      await this.db.transaction().execute(async (trx) => {
        await this.lockBalance(trx, row.customer_id);
        const done = await trx
          .selectFrom("loyalty_transactions")
          .select("id")
          .where("order_id", "=", orderId)
          .where("kind", "=", reversalKind)
          .executeTakeFirst();
        if (done) return;
        await trx
          .insertInto("loyalty_transactions")
          .values({
            customer_id: row.customer_id,
            order_id: orderId,
            kind: reversalKind,
            points: -Number(row.points),
            reward_id: row.reward_id,
            note: "الطلب اتلغى",
          })
          .execute();
        await this.addPoints(trx, row.customer_id, -Number(row.points));
      });
    }
  }

  async history(customerId: string, limit: number): Promise<LoyaltyTransaction[]> {
    const rows = await this.db
      .selectFrom("loyalty_transactions as t")
      .leftJoin("loyalty_rewards as r", "r.id", "t.reward_id")
      .select(["t.id", "t.kind", "t.points", "t.order_id", "t.note", "t.created_at", "r.name as reward_name"])
      .where("t.customer_id", "=", customerId)
      .orderBy("t.created_at", "desc")
      .limit(limit)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as LoyaltyTransactionKind,
      points: Number(r.points),
      orderId: r.order_id,
      rewardName: r.reward_name,
      note: r.note,
      createdAt: r.created_at,
    }));
  }
}
