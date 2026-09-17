import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { BankAccount } from "../../domain/bank-account.aggregate";
import type { BankAccountRepositoryPort } from "../../domain/ports/bank-account-repository.port";
import type { BankAccountsTable } from "./treasury.schema";

@Injectable()
export class KyselyBankAccountRepository implements BankAccountRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(bankAccount: BankAccount): Promise<void> {
    await this.db
      .insertInto("bank_accounts")
      .values({
        id: bankAccount.id,
        bank_id: bankAccount.bankId,
        treasury_id: bankAccount.treasuryId,
        account_number: bankAccount.accountNumber,
        iban: bankAccount.iban,
        bank_branch_name: bankAccount.bankBranchName,
        notes: bankAccount.notes,
        is_active: bankAccount.isActive,
        created_at: bankAccount.createdAt,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          account_number: bankAccount.accountNumber,
          iban: bankAccount.iban,
          bank_branch_name: bankAccount.bankBranchName,
          notes: bankAccount.notes,
          is_active: bankAccount.isActive,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<BankAccount | null> {
    const row = await this.db.selectFrom("bank_accounts").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<BankAccount[]> {
    const rows = await this.db.selectFrom("bank_accounts").selectAll().execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<BankAccountsTable>): BankAccount {
    return BankAccount.reconstitute(row.id, {
      bankId: row.bank_id,
      treasuryId: row.treasury_id,
      accountNumber: row.account_number,
      iban: row.iban,
      bankBranchName: row.bank_branch_name,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
    });
  }
}
