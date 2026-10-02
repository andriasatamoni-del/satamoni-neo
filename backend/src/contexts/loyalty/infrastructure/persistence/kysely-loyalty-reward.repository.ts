import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { LoyaltyReward, type LoyaltyRewardKind } from "../../domain/loyalty-reward.aggregate";
import type { LoyaltyRewardRepositoryPort } from "../../domain/ports/loyalty-reward-repository.port";
import type { LoyaltyRewardsTable } from "./loyalty.schema";

@Injectable()
export class KyselyLoyaltyRewardRepository implements LoyaltyRewardRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

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
    await this.db.insertInto("loyalty_rewards").values(row).onConflict((oc) => oc.column("id").doUpdateSet(update)).execute();
  }

  async findById(id: string): Promise<LoyaltyReward | null> {
    const row = await this.db.selectFrom("loyalty_rewards").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { activeOnly?: boolean }): Promise<LoyaltyReward[]> {
    let query = this.db.selectFrom("loyalty_rewards").selectAll();
    if (filter?.activeOnly) query = query.where("is_active", "=", true);
    return (await query.orderBy("points_cost").orderBy("name").execute()).map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<LoyaltyRewardsTable>): LoyaltyReward {
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
