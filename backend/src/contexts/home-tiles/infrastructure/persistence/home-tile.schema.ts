import type { Generated } from "kysely";

export interface HomeTilesTable {
  id: Generated<string>;
  tile_key: string;
  href: string;
  icon: string;
  title: string;
  description: string;
  display_order: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
