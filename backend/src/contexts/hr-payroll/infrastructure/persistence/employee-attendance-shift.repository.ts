import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { EmployeeAttendanceShift, type EmployeeAttendanceShiftStatus } from "../../domain/employee-attendance-shift.aggregate";
import type { EmployeeAttendanceShiftRepositoryPort } from "../../domain/ports/employee-attendance-shift-repository.port";
import { employeeAttendanceShifts } from "./hr-payroll.tables";

@Injectable()
export class EmployeeAttendanceShiftRepository implements EmployeeAttendanceShiftRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(shift: EmployeeAttendanceShift): Promise<void> {
    const row = this.toRow(shift);
    await this.db
      .insert(employeeAttendanceShifts)
      .values(row)
      .onConflictDoUpdate({
        target: employeeAttendanceShifts.id,
        set: {
          status: row.status,
          checked_out_at: row.checked_out_at,
          hours_worked: row.hours_worked,
          notes: row.notes,
        },
      });
  }

  async findById(id: string): Promise<EmployeeAttendanceShift | null> {
    const [row] = await this.db.select().from(employeeAttendanceShifts).where(eq(employeeAttendanceShifts.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findActiveByEmployeeId(employeeId: string): Promise<EmployeeAttendanceShift | null> {
    const [row] = await this.db
      .select()
      .from(employeeAttendanceShifts)
      .where(and(eq(employeeAttendanceShifts.employee_id, employeeId), eq(employeeAttendanceShifts.status, "ACTIVE")))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { employeeId?: string }): Promise<EmployeeAttendanceShift[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { employeeId?: string }, page?: PageRequest): Promise<{ rows: EmployeeAttendanceShift[]; total: number }> {
    const where = filter?.employeeId ? eq(employeeAttendanceShifts.employee_id, filter.employeeId) : undefined;
    const query = this.db.select().from(employeeAttendanceShifts).where(where).orderBy(desc(employeeAttendanceShifts.checked_in_at), desc(employeeAttendanceShifts.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(employeeAttendanceShifts).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
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

  private toDomain(row: typeof employeeAttendanceShifts.$inferSelect): EmployeeAttendanceShift {
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
