import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Treasury, type TreasuryKind } from "../../domain/treasury.aggregate";
import type { TreasuryRepositoryPort } from "../../domain/ports/treasury-repository.port";
import type { TreasuriesTable } from "./treasury.schema";

@Injectable()
export class KyselyTreasuryRepository implements TreasuryRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(treasury: Treasury): Promise<void> {
    await this.db
      .insertInto("treasuries")
      .values({
        id: treasury.id,
        name: treasury.name,
        kind: treasury.kind,
        branch_id: treasury.branchId,
        account_id: treasury.accountId,
        created_at: treasury.createdAt,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }

  async findById(id: string): Promise<Treasury | null> {
    const row = await this.db.selectFrom("treasuries").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string }): Promise<Treasury[]> {
    let query = this.db.selectFrom("treasuries").selectAll();
    if (filter?.branchId) {
      query = query.where((eb) => eb.or([eb("branch_id", "=", filter.branchId!), eb("branch_id", "is", null)]));
    }
    const rows = await query.orderBy("name").execute();
    // خزينة رئيسية الأول ثم البنوك - نفس ترتيب الريبو القديم بالظبط
    rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "MAIN" ? -1 : 1));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<TreasuriesTable>): Treasury {
    return Treasury.reconstitute(row.id, {
      name: row.name,
      kind: row.kind as TreasuryKind,
      branchId: row.branch_id,
      accountId: row.account_id,
      createdAt: row.created_at,
    });
  }
}
