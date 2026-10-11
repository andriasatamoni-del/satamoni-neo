import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { employeeHistory } from "../../infrastructure/persistence/hr-payroll.tables";

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
  constructor(@Inject(DATABASE) private readonly db: Database) {}

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

      await this.db.insert(employeeHistory).values({
        employee_id: input.employeeId,
        field_name: field,
        old_value: oldValue,
        new_value: newValue,
        effective_date: input.effectiveDate ?? new Date(),
        changed_by: input.changedBy,
        reason: input.reason ?? null,
      });
    }
  }

  async listByEmployee(employeeId: string): Promise<EmployeeHistoryEntry[]> {
    const rows = await this.db
      .select({
        id: employeeHistory.id,
        employee_id: employeeHistory.employee_id,
        field_name: employeeHistory.field_name,
        old_value: employeeHistory.old_value,
        new_value: employeeHistory.new_value,
        effective_date: employeeHistory.effective_date,
        changed_by: employeeHistory.changed_by,
        changed_by_name: users.name,
        reason: employeeHistory.reason,
        created_at: employeeHistory.created_at,
      })
      .from(employeeHistory)
      .leftJoin(users, eq(users.id, employeeHistory.changed_by))
      .where(eq(employeeHistory.employee_id, employeeId))
      .orderBy(desc(employeeHistory.effective_date), desc(employeeHistory.id));

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
