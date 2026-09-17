import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { DriverAttendanceShift, type DriverAttendanceShiftStatus } from "../../domain/driver-attendance-shift.aggregate";
import type { DriverAttendanceShiftRepositoryPort } from "../../domain/ports/driver-attendance-shift-repository.port";
import type { DriverAttendanceShiftsTable } from "./delivery.schema";

@Injectable()
export class KyselyDriverAttendanceShiftRepository implements DriverAttendanceShiftRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(shift: DriverAttendanceShift): Promise<void> {
    await this.db
      .insertInto("driver_attendance_shifts")
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
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          status: shift.status,
          checked_out_by: shift.checkedOutBy,
          checked_out_at: shift.checkedOutAt,
          hours_worked: shift.hoursWorked,
          wage_amount: shift.wageAmount,
          bonus_total: shift.bonusTotal,
          total_pay: shift.totalPay,
          notes: shift.notes,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<DriverAttendanceShift | null> {
    const row = await this.db.selectFrom("driver_attendance_shifts").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findActiveByDriverId(driverId: string): Promise<DriverAttendanceShift | null> {
    const row = await this.db
      .selectFrom("driver_attendance_shifts")
      .selectAll()
      .where("driver_id", "=", driverId)
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; driverId?: string; status?: string }): Promise<DriverAttendanceShift[]> {
    let query = this.db.selectFrom("driver_attendance_shifts").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.driverId) query = query.where("driver_id", "=", filter.driverId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("checked_in_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<DriverAttendanceShiftsTable>): DriverAttendanceShift {
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
