import type { Generated } from "kysely";

export interface BranchesTable {
  id: Generated<string>;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  lat: number | null;
  lng: number | null;
  is_central_kitchen: boolean;
  supports_dine_in: boolean;
  legacy_branch_id: number | null;
}
