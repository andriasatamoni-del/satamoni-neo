import type { Generated } from "kysely";

export interface AccountsTable {
  id: Generated<string>;
  code: string;
  name: string;
  account_type: string;
  parent_account_id: string | null;
  branch_id: string | null;
  is_active: boolean;
  is_system_account: boolean;
  legacy_account_id: number | null;
  created_at: Generated<Date>;
}

export interface JournalEntriesTable {
  id: Generated<string>;
  entry_number: string;
  entry_date: Date;
  description: string | null;
  source_type: string;
  source_id: string | null;
  branch_id: string | null;
  status: string;
  created_by: string | null;
  posted_at: Date | null;
  reversed_at: Date | null;
  reversal_of_entry_id: string | null;
  reversal_reason: string | null;
  created_at: Generated<Date>;
}

export interface JournalEntryLinesTable {
  id: Generated<string>;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
}
