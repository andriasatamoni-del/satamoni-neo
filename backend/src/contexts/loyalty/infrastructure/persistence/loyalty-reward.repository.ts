import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { LoyaltyReward, type LoyaltyRewardKind } from "../../domain/loyalty-reward.aggregate";
import type { LoyaltyRewardRepositoryPort } from "../../domain/ports/loyalty-reward-repository.port";
import { loyaltyRewards } from "./loyalty.tables";

@Injectable()
export class LoyaltyRewardRepository implements LoyaltyRewardRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(reward: LoyaltyReward): Promise<void> {
    const row = {
      id: reward.id,
      name: reward.name,
      description: reward.description,
      image_url: reward.imageUrl,
      points_cost: reward.pointsCost,
      kind: reward.kind,
      discount_amount: reward.discountAmount,
      variant_id: reward.variantId,
      combo_id: reward.comboId,
      is_active: reward.isActive,
      created_at: reward.createdAt,
    };
    const { id: _id, created_at: _createdAt, ...update } = row;
    await this.db.insert(loyaltyRewards).values(row).onConflictDoUpdate({ target: loyaltyRewards.id, set: update });
  }

  async findById(id: string): Promise<LoyaltyReward | null> {
    const [row] = await this.db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { activeOnly?: boolean }): Promise<LoyaltyReward[]> {
    const rows = await this.db
      .select()
      .from(loyaltyRewards)
      .where(filter?.activeOnly ? eq(loyaltyRewards.is_active, true) : undefined)
      .orderBy(asc(loyaltyRewards.points_cost), asc(loyaltyRewards.name));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof loyaltyRewards.$inferSelect): LoyaltyReward {
    return LoyaltyReward.reconstitute(row.id, {
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      pointsCost: row.points_cost,
      kind: row.kind as LoyaltyRewardKind,
      discountAmount: row.discount_amount === null ? null : Number(row.discount_amount),
      variantId: row.variant_id,
      comboId: row.combo_id,
      isActive: row.is_active,
      createdAt: row.created_at,
    });
  }
}
