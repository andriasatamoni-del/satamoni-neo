import type { ColumnType, Generated, JSONColumnType } from "kysely";

// النوع اللي Kysely بيتعامل بيه مع جدول users - مطابق للـmigration بالظبط (001_create_identity_access_tables)
export interface UsersTable {
  id: Generated<string>;
  branch_id: string | null;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  permission_grants: JSONColumnType<string[]>;
  permission_revokes: JSONColumnType<string[]>;
  pin_hash: string | null;
  is_active: boolean;
  legacy_user_id: number | null;
  created_at: ColumnType<Date, string | Date, never>;
  updated_at: ColumnType<Date, string | Date, string | Date>;
}
