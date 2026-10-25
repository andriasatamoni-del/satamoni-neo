import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { DriverAttendanceShift, type DriverAttendanceShiftStatus } from "../../domain/driver-attendance-shift.aggregate";
import type { DriverAttendanceShiftRepositoryPort } from "../../domain/ports/driver-attendance-shift-repository.port";
import { driverAttendanceShifts } from "./delivery.tables";

@Injectable()
export class DriverAttendanceShiftRepository implements DriverAttendanceShiftRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(shift: DriverAttendanceShift): Promise<void> {
    await this.db
      .insert(driverAttendanceShifts)
      .values({
        id: shift.id,
        driver_id: shift.driverId,
        branch_id: shift.branchId,
        status: shift.status,
        checked_in_by: shift.checkedInBy,
        checked_in_at: shift.checkedInAt,
        checked_out_by: shift.checkedOutBy,
        checked_out_at: shift.checkedOutAt,
        hourly_rate: shift.hourlyRate,
        hours_worked: shift.hoursWorked,
        wage_amount: shift.wageAmount,
        bonus_total: shift.bonusTotal,
        total_pay: shift.totalPay,
        notes: shift.notes,
      })
      .onConflictDoUpdate({
        target: driverAttendanceShifts.id,
        set: {
          status: shift.status,
          checked_out_by: shift.checkedOutBy,
          checked_out_at: shift.checkedOutAt,
          hours_worked: shift.hoursWorked,
          wage_amount: shift.wageAmount,
          bonus_total: shift.bonusTotal,
          total_pay: shift.totalPay,
          notes: shift.notes,
        },
      });
  }

  async findById(id: string): Promise<DriverAttendanceShift | null> {
    const [row] = await this.db.select().from(driverAttendanceShifts).where(eq(driverAttendanceShifts.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findActiveByDriverId(driverId: string): Promise<DriverAttendanceShift | null> {
    const [row] = await this.db
      .select()
      .from(driverAttendanceShifts)
      .where(and(eq(driverAttendanceShifts.driver_id, driverId), eq(driverAttendanceShifts.status, "ACTIVE")))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; driverId?: string; status?: string }): Promise<DriverAttendanceShift[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { branchId?: string; driverId?: string; status?: string }, page?: PageRequest): Promise<{ rows: DriverAttendanceShift[]; total: number }> {
    const where = and(
      filter?.branchId ? eq(driverAttendanceShifts.branch_id, filter.branchId) : undefined,
      filter?.driverId ? eq(driverAttendanceShifts.driver_id, filter.driverId) : undefined,
      filter?.status ? eq(driverAttendanceShifts.status, filter.status) : undefined
    );
    const query = this.db.select().from(driverAttendanceShifts).where(where).orderBy(desc(driverAttendanceShifts.checked_in_at), desc(driverAttendanceShifts.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(driverAttendanceShifts).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  private toDomain(row: typeof driverAttendanceShifts.$inferSelect): DriverAttendanceShift {
    return DriverAttendanceShift.reconstitute(row.id, {
      driverId: row.driver_id,
      branchId: row.branch_id,
      status: row.status as DriverAttendanceShiftStatus,
      checkedInBy: row.checked_in_by,
      checkedInAt: row.checked_in_at,
      checkedOutBy: row.checked_out_by,
      checkedOutAt: row.checked_out_at,
      hourlyRate: Number(row.hourly_rate),
      hoursWorked: row.hours_worked === null ? null : Number(row.hours_worked),
      wageAmount: row.wage_amount === null ? null : Number(row.wage_amount),
      bonusTotal: row.bonus_total === null ? null : Number(row.bonus_total),
      totalPay: row.total_pay === null ? null : Number(row.total_pay),
      notes: row.notes,
    });
  }
}
