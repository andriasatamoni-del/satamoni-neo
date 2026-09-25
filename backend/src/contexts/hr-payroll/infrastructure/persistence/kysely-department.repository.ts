import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Department } from "../../domain/department.aggregate";
import type { DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import type { DepartmentsTable } from "./hr-payroll.schema";

@Injectable()
export class KyselyDepartmentRepository implements DepartmentRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(department: Department): Promise<void> {
    const row = this.toRow(department);
    await this.db
      .insertInto("departments")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({ name: row.name, description: row.description, status: row.status }))
      .execute();
  }

  async findById(id: string): Promise<Department | null> {
    const row = await this.db.selectFrom("departments").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyDepartmentId(legacyId: number): Promise<Department | null> {
    const row = await this.db.selectFrom("departments").selectAll().where("legacy_department_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    let query = this.db.selectFrom("departments").select("id").where("code", "=", code);
    if (excludeId) query = query.where("id", "!=", excludeId);
    return !!(await query.executeTakeFirst());
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    let query = this.db.selectFrom("departments").select("id").where("name", "=", name);
    if (excludeId) query = query.where("id", "!=", excludeId);
    return !!(await query.executeTakeFirst());
  }

  async list(filter?: { status?: string }): Promise<Department[]> {
    let query = this.db.selectFrom("departments").selectAll();
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(department: Department) {
    return {
      id: department.id,
      code: department.code,
      name: department.name,
      description: department.description,
      status: department.status,
      legacy_department_id: department.legacyDepartmentId,
      created_at: department.createdAt,
    };
  }

  private toDomain(row: Selectable<DepartmentsTable>): Department {
    return Department.reconstitute(row.id, {
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status as "active" | "inactive",
      legacyDepartmentId: row.legacy_department_id,
      createdAt: row.created_at,
    });
  }
}
