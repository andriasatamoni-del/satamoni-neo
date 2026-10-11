import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { DATABASE, type Database, type Executor } from "../../../../shared/database/database.token";
import { customers } from "../../../customers/infrastructure/persistence/customers.tables";
import type { LoyaltyLedgerPort, LoyaltyTransaction, LoyaltyTransactionKind } from "../../domain/ports/loyalty-ledger.port";
import { InsufficientLoyaltyPointsError } from "../../domain/errors";
import { loyaltyRewards, loyaltyTransactions } from "./loyalty.tables";

@Injectable()
export class LoyaltyLedger implements LoyaltyLedgerPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async balance(customerId: string): Promise<number> {
    const [row] = await this.db.select({ loyalty_points: customers.loyalty_points }).from(customers).where(eq(customers.id, customerId)).limit(1);
    return row ? Number(row.loyalty_points) : 0;
  }

  // كل عملية بتقفل صف العميل الأول (FOR UPDATE) - عمليتين على نفس العميل في نفس اللحظة بيتسلسلوا
  private async lockBalance(tx: Executor, customerId: string): Promise<number> {
    const [row] = await tx
      .select({ loyalty_points: customers.loyalty_points })
      .from(customers)
      .where(eq(customers.id, customerId))
      .for("update");
    return row ? Number(row.loyalty_points) : 0;
  }

  private async addPoints(tx: Executor, customerId: string, delta: number): Promise<void> {
    await tx
      .update(customers)
      .set({ loyalty_points: sql`GREATEST(${customers.loyalty_points} + ${delta}, 0)`, updated_at: new Date() })
      .where(eq(customers.id, customerId));
  }

  async earnForOrder(customerId: string, orderId: string, points: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await this.lockBalance(tx, customerId);
      const [exists] = await tx
        .select({ id: loyaltyTransactions.id })
        .from(loyaltyTransactions)
        .where(and(eq(loyaltyTransactions.order_id, orderId), eq(loyaltyTransactions.kind, "earn")))
        .limit(1);
      if (exists) return false;
      await tx.insert(loyaltyTransactions).values({ customer_id: customerId, order_id: orderId, kind: "earn", points });
      await this.addPoints(tx, customerId, points);
      return true;
    });
  }

  async reserveRedemption(input: { customerId: string; requestId: string; rewardId: string; points: number; note: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const balance = await this.lockBalance(tx, input.customerId);
      const [existing] = await tx
        .select({ id: loyaltyTransactions.id })
        .from(loyaltyTransactions)
        .where(eq(loyaltyTransactions.request_id, input.requestId))
        .limit(1);
      if (existing) return; // نفس الطلب اتبعت تاني - الحجز موجود بالفعل
      if (balance < input.points) throw new InsufficientLoyaltyPointsError(input.points, balance);
      await tx.insert(loyaltyTransactions).values({
        customer_id: input.customerId,
        request_id: input.requestId,
        kind: "redeem",
        points: -input.points,
        reward_id: input.rewardId,
        note: input.note,
      });
      await this.addPoints(tx, input.customerId, -input.points);
    });
  }

  async attachReservationToOrder(requestId: string, orderId: string): Promise<void> {
    await this.db
      .update(loyaltyTransactions)
      .set({ order_id: orderId })
      .where(and(eq(loyaltyTransactions.request_id, requestId), isNull(loyaltyTransactions.order_id)));
  }

  async releaseReservation(requestId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: loyaltyTransactions.id, customer_id: loyaltyTransactions.customer_id, points: loyaltyTransactions.points })
        .from(loyaltyTransactions)
        .where(and(eq(loyaltyTransactions.request_id, requestId), isNull(loyaltyTransactions.order_id)))
        .limit(1);
      if (!row) return;
      await this.lockBalance(tx, row.customer_id);
      // حجز لطلب عمره ما اتسجّل - مش حركة حقيقية، بيتشال من السجل خالص
      await tx.delete(loyaltyTransactions).where(eq(loyaltyTransactions.id, row.id));
      await this.addPoints(tx, row.customer_id, -Number(row.points));
    });
  }

  async settleCancelledOrder(orderId: string): Promise<void> {
    const rows = await this.db
      .select({
        customer_id: loyaltyTransactions.customer_id,
        kind: loyaltyTransactions.kind,
        points: loyaltyTransactions.points,
        reward_id: loyaltyTransactions.reward_id,
      })
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.order_id, orderId));
    const reversals: Record<string, LoyaltyTransactionKind> = { earn: "reverse_earn", redeem: "refund_redeem" };
    for (const row of rows) {
      const reversalKind = reversals[row.kind];
      if (!reversalKind || rows.some((r) => r.kind === reversalKind)) continue;
      await this.db.transaction(async (tx) => {
        await this.lockBalance(tx, row.customer_id);
        const [done] = await tx
          .select({ id: loyaltyTransactions.id })
          .from(loyaltyTransactions)
          .where(and(eq(loyaltyTransactions.order_id, orderId), eq(loyaltyTransactions.kind, reversalKind)))
          .limit(1);
        if (done) return;
        await tx.insert(loyaltyTransactions).values({
          customer_id: row.customer_id,
          order_id: orderId,
          kind: reversalKind,
          points: -Number(row.points),
          reward_id: row.reward_id,
          note: "الطلب اتلغى",
        });
        await this.addPoints(tx, row.customer_id, -Number(row.points));
      });
    }
  }

  async history(customerId: string, limit: number): Promise<LoyaltyTransaction[]> {
    const rows = await this.db
      .select({
        id: loyaltyTransactions.id,
        kind: loyaltyTransactions.kind,
        points: loyaltyTransactions.points,
        order_id: loyaltyTransactions.order_id,
        note: loyaltyTransactions.note,
        created_at: loyaltyTransactions.created_at,
        reward_name: loyaltyRewards.name,
      })
      .from(loyaltyTransactions)
      .leftJoin(loyaltyRewards, eq(loyaltyRewards.id, loyaltyTransactions.reward_id))
      .where(eq(loyaltyTransactions.customer_id, customerId))
      .orderBy(desc(loyaltyTransactions.created_at))
      .limit(limit);
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
