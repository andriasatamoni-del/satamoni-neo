import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { LeaveRequest, type LeaveRequestStatus } from "../../domain/leave-request.aggregate";
import type { LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";
import { employeeLeaveRequests } from "./hr-payroll.tables";

@Injectable()
export class LeaveRequestRepository implements LeaveRequestRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(request: LeaveRequest): Promise<void> {
    const row = this.toRow(request);
    await this.db
      .insert(employeeLeaveRequests)
      .values(row)
      .onConflictDoUpdate({
        target: employeeLeaveRequests.id,
        set: {
          status: row.status,
          reviewed_by: row.reviewed_by,
          reviewed_at: row.reviewed_at,
          review_notes: row.review_notes,
        },
      });
  }

  async findById(id: string): Promise<LeaveRequest | null> {
    const [row] = await this.db.select().from(employeeLeaveRequests).where(eq(employeeLeaveRequests.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { employeeId?: string; status?: string }): Promise<LeaveRequest[]> {
    const rows = await this.db
      .select()
      .from(employeeLeaveRequests)
      .where(
        and(
          filter?.employeeId ? eq(employeeLeaveRequests.employee_id, filter.employeeId) : undefined,
          filter?.status ? eq(employeeLeaveRequests.status, filter.status) : undefined
        )
      )
      .orderBy(desc(employeeLeaveRequests.created_at));
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

  private toDomain(row: typeof employeeLeaveRequests.$inferSelect): LeaveRequest {
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
