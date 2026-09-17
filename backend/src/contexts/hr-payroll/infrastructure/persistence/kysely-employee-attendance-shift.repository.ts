import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { EmployeeAttendanceShift, type EmployeeAttendanceShiftStatus } from "../../domain/employee-attendance-shift.aggregate";
import type { EmployeeAttendanceShiftRepositoryPort } from "../../domain/ports/employee-attendance-shift-repository.port";
import type { EmployeeAttendanceShiftsTable } from "./hr-payroll.schema";

@Injectable()
export class KyselyEmployeeAttendanceShiftRepository implements EmployeeAttendanceShiftRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(shift: EmployeeAttendanceShift): Promise<void> {
    const row = this.toRow(shift);
    await this.db
      .insertInto("employee_attendance_shifts")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          status: row.status,
          checked_out_at: row.checked_out_at,
          hours_worked: row.hours_worked,
          notes: row.notes,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<EmployeeAttendanceShift | null> {
    const row = await this.db.selectFrom("employee_attendance_shifts").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findActiveByEmployeeId(employeeId: string): Promise<EmployeeAttendanceShift | null> {
    const row = await this.db
      .selectFrom("employee_attendance_shifts")
      .selectAll()
      .where("employee_id", "=", employeeId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { employeeId?: string }): Promise<EmployeeAttendanceShift[]> {
    let query = this.db.selectFrom("employee_attendance_shifts").selectAll();
    if (filter?.employeeId) query = query.where("employee_id", "=", filter.employeeId);
    const rows = await query.orderBy("checked_in_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(shift: EmployeeAttendanceShift) {
    return {
      id: shift.id,
      employee_id: shift.employeeId,
      branch_id: shift.branchId,
      status: shift.status,
      checked_in_at: shift.checkedInAt,
      checked_out_at: shift.checkedOutAt,
      hours_worked: shift.hoursWorked,
      notes: shift.notes,
    };
  }

  private toDomain(row: Selectable<EmployeeAttendanceShiftsTable>): EmployeeAttendanceShift {
    return EmployeeAttendanceShift.reconstitute(row.id, {
      employeeId: row.employee_id,
      branchId: row.branch_id,
      status: row.status as EmployeeAttendanceShiftStatus,
      checkedInAt: row.checked_in_at,
      checkedOutAt: row.checked_out_at,
      hoursWorked: row.hours_worked != null ? Number(row.hours_worked) : null,
      notes: row.notes,
    });
  }
}
