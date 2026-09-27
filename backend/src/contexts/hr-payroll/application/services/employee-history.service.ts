import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";

// نفس TRACKED_FIELDS في الريبو القديم بالظبط (db/employee-history.js) - department/job_title هناك
// بقوا department_id/position_id هنا (HRF-6: كيانات حقيقية بدل نص حر)
const TRACKED_FIELDS = ["department_id", "position_id", "restricted_branch_id", "status"] as const;

export interface EmployeeHistoryChanges {
  department_id?: string | null;
  position_id?: string | null;
  restricted_branch_id?: string | null;
  status?: string | null;
}

export interface EmployeeHistoryEntry {
  id: string;
  employeeId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  effectiveDate: string;
  changedBy: string | null;
  changedByName: string | null;
  reason: string | null;
  createdAt: string;
}

// تسجيل مركزي لتغييرات جوهرية على بيانات الموظف (فرع/قسم/وظيفة/حالة) - append-only، نفس فلسفة
// db/employee-history.js بالريبو القديم بالحرف: سطر واحد بس للحقول اللي فعليًا اتغيّرت (لو نفس القيمة
// القديمة، مفيش سطر يتسجّل خالص)
@Injectable()
export class EmployeeHistoryService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async recordChanges(input: {
    employeeId: string;
    before: EmployeeHistoryChanges;
    changes: EmployeeHistoryChanges;
    changedBy: string | null;
    reason?: string | null;
    effectiveDate?: Date | null;
  }): Promise<void> {
    for (const field of TRACKED_FIELDS) {
      const newRaw = input.changes[field];
      if (newRaw === undefined) continue;
      const oldValue = input.before[field] == null ? null : String(input.before[field]);
      const newValue = newRaw === null ? null : String(newRaw);
      if (oldValue === newValue) continue;

      await this.db
        .insertInto("employee_history")
        .values({
          employee_id: input.employeeId,
          field_name: field,
          old_value: oldValue,
          new_value: newValue,
          effective_date: input.effectiveDate ?? new Date(),
          changed_by: input.changedBy,
          reason: input.reason ?? null,
        })
        .execute();
    }
  }

  async listByEmployee(employeeId: string): Promise<EmployeeHistoryEntry[]> {
    const rows = await this.db
      .selectFrom("employee_history")
      .leftJoin("users", "users.id", "employee_history.changed_by")
      .select([
        "employee_history.id as id",
        "employee_history.employee_id as employee_id",
        "employee_history.field_name as field_name",
        "employee_history.old_value as old_value",
        "employee_history.new_value as new_value",
        "employee_history.effective_date as effective_date",
        "employee_history.changed_by as changed_by",
        "users.name as changed_by_name",
        "employee_history.reason as reason",
        "employee_history.created_at as created_at",
      ])
      .where("employee_history.employee_id", "=", employeeId)
      .orderBy("employee_history.effective_date", "desc")
      .orderBy("employee_history.id", "desc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      fieldName: r.field_name,
      oldValue: r.old_value,
      newValue: r.new_value,
      effectiveDate: r.effective_date.toISOString().slice(0, 10),
      changedBy: r.changed_by,
      changedByName: r.changed_by_name,
      reason: r.reason,
      createdAt: r.created_at.toISOString(),
    }));
  }
}
