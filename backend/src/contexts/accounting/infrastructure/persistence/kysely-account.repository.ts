import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Account, type AccountType } from "../../domain/account.aggregate";
import type { AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import type { AccountsTable } from "./accounting.schema";

@Injectable()
export class KyselyAccountRepository implements AccountRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(account: Account): Promise<void> {
    const row = this.toRow(account);
    await this.db
      .insertInto("accounts")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          account_type: row.account_type,
          parent_account_id: row.parent_account_id,
          branch_id: row.branch_id,
          is_active: row.is_active,
          is_system_account: row.is_system_account,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Account | null> {
    const row = await this.db.selectFrom("accounts").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Account | null> {
    const row = await this.db.selectFrom("accounts").selectAll().where("code", "=", code.trim()).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async existsByCode(code: string): Promise<boolean> {
    const row = await this.db.selectFrom("accounts").select("id").where("code", "=", code.trim()).executeTakeFirst();
    return !!row;
  }

  async findByLegacyAccountId(legacyId: number): Promise<Account | null> {
    const row = await this.db.selectFrom("accounts").selectAll().where("legacy_account_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<Account[]> {
    const rows = await this.db.selectFrom("accounts").selectAll().orderBy("code").execute();
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

  private toDomain(row: Selectable<AccountsTable>): Account {
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
