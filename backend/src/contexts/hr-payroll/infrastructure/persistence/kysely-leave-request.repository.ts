import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { LeaveRequest, type LeaveRequestStatus } from "../../domain/leave-request.aggregate";
import type { LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";
import type { EmployeeLeaveRequestsTable } from "./hr-payroll.schema";

@Injectable()
export class KyselyLeaveRequestRepository implements LeaveRequestRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(request: LeaveRequest): Promise<void> {
    const row = this.toRow(request);
    await this.db
      .insertInto("employee_leave_requests")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          status: row.status,
          reviewed_by: row.reviewed_by,
          reviewed_at: row.reviewed_at,
          review_notes: row.review_notes,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<LeaveRequest | null> {
    const row = await this.db.selectFrom("employee_leave_requests").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { employeeId?: string; status?: string }): Promise<LeaveRequest[]> {
    let query = this.db.selectFrom("employee_leave_requests").selectAll();
    if (filter?.employeeId) query = query.where("employee_id", "=", filter.employeeId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(request: LeaveRequest) {
    return {
      id: request.id,
      employee_id: request.employeeId,
      leave_type: request.leaveType,
      start_date: request.startDate,
      end_date: request.endDate,
      days: request.days,
      reason: request.reason,
      status: request.status,
      reviewed_by: request.reviewedBy,
      reviewed_at: request.reviewedAt,
      review_notes: request.reviewNotes,
      created_at: request.createdAt,
    };
  }

  private toDomain(row: Selectable<EmployeeLeaveRequestsTable>): LeaveRequest {
    return LeaveRequest.reconstitute(row.id, {
      employeeId: row.employee_id,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      days: row.days,
      reason: row.reason,
      status: row.status as LeaveRequestStatus,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      reviewNotes: row.review_notes,
      createdAt: row.created_at,
    });
  }
}
