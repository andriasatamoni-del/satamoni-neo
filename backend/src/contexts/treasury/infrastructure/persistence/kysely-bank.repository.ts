import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Bank } from "../../domain/bank.aggregate";
import type { BankRepositoryPort } from "../../domain/ports/bank-repository.port";
import type { BanksTable } from "./treasury.schema";

@Injectable()
export class KyselyBankRepository implements BankRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(bank: Bank): Promise<void> {
    await this.db
      .insertInto("banks")
      .values({ id: bank.id, name: bank.name, is_active: bank.isActive, created_at: bank.createdAt })
      .onConflict((oc) => oc.column("id").doUpdateSet({ name: bank.name, is_active: bank.isActive }))
      .execute();
  }

  async findById(id: string): Promise<Bank | null> {
    const row = await this.db.selectFrom("banks").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<Bank[]> {
    const rows = await this.db.selectFrom("banks").selectAll().orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<BanksTable>): Bank {
    return Bank.reconstitute(row.id, { name: row.name, isActive: row.is_active, createdAt: row.created_at });
  }
}
