import type { Generated } from "kysely";

export interface CustomersTable {
  id: Generated<string>;
  phone: string;
  phone2: string | null;
  name: string | null;
  address_details: string | null;
  distinguishing_mark: string | null;
  notes: string | null;
  loyalty_points: number;
  password_hash: string | null;
  is_blocked: boolean;
  block_reason: string | null;
  blocked_by: string | null;
  blocked_at: Date | null;
  legacy_customer_id: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomerAddressesTable {
  id: Generated<string>;
  customer_id: string;
  label: string | null;
  address_details: string;
  distinguishing_mark: string | null;
  is_default: boolean;
  created_at: Generated<Date>;
}
