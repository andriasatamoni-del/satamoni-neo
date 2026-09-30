import type { Generated } from "kysely";

export interface LoyaltyRewardsTable {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  points_cost: number;
  kind: string;
  discount_amount: number | null;
  variant_id: string | null;
  combo_id: string | null;
  is_active: boolean;
  created_at: Generated<Date>;
}

export interface LoyaltyTransactionsTable {
  id: Generated<string>;
  customer_id: string;
  order_id: string | null;
  request_id: string | null;
  kind: string;
  points: number;
  reward_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}
