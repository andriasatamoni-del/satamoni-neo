import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Account, type AccountType } from "../../domain/account.aggregate";
import type { AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { accounts } from "./accounting.tables";

@Injectable()
export class AccountRepository implements AccountRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(account: Account): Promise<void> {
    const row = this.toRow(account);
    await this.db
      .insert(accounts)
      .values(row)
      .onConflictDoUpdate({
        target: accounts.id,
        set: {
          name: row.name,
          account_type: row.account_type,
          parent_account_id: row.parent_account_id,
          branch_id: row.branch_id,
          is_active: row.is_active,
          is_system_account: row.is_system_account,
        },
      });
  }

  async findById(id: string): Promise<Account | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Account | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.code, code.trim())).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsByCode(code: string): Promise<boolean> {
    const [row] = await this.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.code, code.trim())).limit(1);
    return !!row;
  }

  async findByLegacyAccountId(legacyId: number): Promise<Account | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.legacy_account_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<Account[]> {
    const rows = await this.db.select().from(accounts).orderBy(asc(accounts.code));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(account: Account) {
    return {
      id: account.id,
      code: account.code,
      name: account.name,
      account_type: account.accountType,
      parent_account_id: account.parentAccountId,
      branch_id: account.branchId,
      is_active: account.isActive,
      is_system_account: account.isSystemAccount,
      legacy_account_id: account.legacyAccountId,
      created_at: account.createdAt,
    };
  }

  private toDomain(row: typeof accounts.$inferSelect): Account {
    return Account.reconstitute(row.id, {
      code: row.code,
      name: row.name,
      accountType: row.account_type as AccountType,
      parentAccountId: row.parent_account_id,
      branchId: row.branch_id,
      isActive: row.is_active,
      isSystemAccount: row.is_system_account,
      legacyAccountId: row.legacy_account_id,
      createdAt: row.created_at,
    });
  }
}
