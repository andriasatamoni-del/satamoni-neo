import type { Generated } from "kysely";

export interface TreasuriesTable {
  id: Generated<string>;
  name: string;
  kind: string;
  branch_id: string | null;
  account_id: string;
  created_at: Generated<Date>;
}

export interface BanksTable {
  id: Generated<string>;
  name: string;
  is_active: boolean;
  created_at: Generated<Date>;
}

export interface BankAccountsTable {
  id: Generated<string>;
  bank_id: string;
  treasury_id: string;
  account_number: string | null;
  iban: string | null;
  bank_branch_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Generated<Date>;
}
