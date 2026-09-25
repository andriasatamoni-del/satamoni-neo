import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Position } from "../../domain/position.aggregate";
import type { PositionRepositoryPort } from "../../domain/ports/position-repository.port";
import type { PositionsTable } from "./hr-payroll.schema";

@Injectable()
export class KyselyPositionRepository implements PositionRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(position: Position): Promise<void> {
    const row = this.toRow(position);
    await this.db
      .insertInto("positions")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({ name: row.name, department_id: row.department_id, description: row.description, status: row.status })
      )
      .execute();
  }

  async findById(id: string): Promise<Position | null> {
    const row = await this.db.selectFrom("positions").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyPositionId(legacyId: number): Promise<Position | null> {
    const row = await this.db.selectFrom("positions").selectAll().where("legacy_position_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    let query = this.db.selectFrom("positions").select("id").where("code", "=", code);
    if (excludeId) query = query.where("id", "!=", excludeId);
    return !!(await query.executeTakeFirst());
  }

  async list(filter?: { status?: string; departmentId?: string }): Promise<Position[]> {
    let query = this.db.selectFrom("positions").selectAll();
    if (filter?.status) query = query.where("status", "=", filter.status);
    if (filter?.departmentId) query = query.where("department_id", "=", filter.departmentId);
    const rows = await query.orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(position: Position) {
    return {
      id: position.id,
      code: position.code,
      name: position.name,
      department_id: position.departmentId,
      description: position.description,
      status: position.status,
      legacy_position_id: position.legacyPositionId,
      created_at: position.createdAt,
    };
  }

  private toDomain(row: Selectable<PositionsTable>): Position {
    return Position.reconstitute(row.id, {
      code: row.code,
      name: row.name,
      departmentId: row.department_id,
      description: row.description,
      status: row.status as "active" | "inactive",
      legacyPositionId: row.legacy_position_id,
      createdAt: row.created_at,
    });
  }
}
