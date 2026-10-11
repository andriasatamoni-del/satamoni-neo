import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Position } from "../../domain/position.aggregate";
import type { PositionRepositoryPort } from "../../domain/ports/position-repository.port";
import { positions } from "./hr-payroll.tables";

@Injectable()
export class PositionRepository implements PositionRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(position: Position): Promise<void> {
    const row = this.toRow(position);
    await this.db
      .insert(positions)
      .values(row)
      .onConflictDoUpdate({
        target: positions.id,
        set: { name: row.name, department_id: row.department_id, description: row.description, status: row.status },
      });
  }

  async findById(id: string): Promise<Position | null> {
    const [row] = await this.db.select().from(positions).where(eq(positions.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyPositionId(legacyId: number): Promise<Position | null> {
    const [row] = await this.db.select().from(positions).where(eq(positions.legacy_position_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.code, code), excludeId ? ne(positions.id, excludeId) : undefined))
      .limit(1);
    return !!row;
  }

  async list(filter?: { status?: string; departmentId?: string }): Promise<Position[]> {
    const rows = await this.db
      .select()
      .from(positions)
      .where(
        and(
          filter?.status ? eq(positions.status, filter.status) : undefined,
          filter?.departmentId ? eq(positions.department_id, filter.departmentId) : undefined
        )
      )
      .orderBy(asc(positions.name));
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

  private toDomain(row: typeof positions.$inferSelect): Position {
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
