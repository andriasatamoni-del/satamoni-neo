import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Complaint, type ComplaintStatus } from "../../domain/complaint.aggregate";
import type { ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";
import { complaints } from "./crm.tables";

@Injectable()
export class ComplaintRepository implements ComplaintRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(complaint: Complaint): Promise<void> {
    const row = this.toRow(complaint);
    await this.db
      .insert(complaints)
      .values(row)
      .onConflictDoUpdate({
        target: complaints.id,
        set: {
          legacy_order_id: row.legacy_order_id,
          branch_id: row.branch_id,
          followup_id: row.followup_id,
          category: row.category,
          description: row.description,
          status: row.status,
          resolution_notes: row.resolution_notes,
          created_by: row.created_by,
          assigned_to: row.assigned_to,
          resolved_by: row.resolved_by,
          resolved_at: row.resolved_at,
        },
      });
  }

  async findById(id: string): Promise<Complaint | null> {
    const [row] = await this.db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { status?: ComplaintStatus }): Promise<Complaint[]> {
    const rows = await this.db
      .select()
      .from(complaints)
      .where(filter?.status ? eq(complaints.status, filter.status) : undefined)
      .orderBy(desc(complaints.created_at));
    return rows.map((r) => this.toDomain(r));
  }

  async findLatestByPhone(phone: string): Promise<Complaint | null> {
    const [row] = await this.db
      .select()
      .from(complaints)
      .where(eq(complaints.customer_phone, phone))
      .orderBy(desc(complaints.created_at))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyComplaintId(
    legacySource: "customer_complaints" | "whatsapp_complaints",
    legacyComplaintId: number
  ): Promise<Complaint | null> {
    const [row] = await this.db
      .select()
      .from(complaints)
      .where(and(eq(complaints.legacy_source, legacySource), eq(complaints.legacy_complaint_id, legacyComplaintId)))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  private toRow(complaint: Complaint): typeof complaints.$inferInsert {
    return {
      id: complaint.id,
      channel: complaint.channel,
      legacy_order_id: complaint.legacyOrderId,
      branch_id: complaint.branchId,
      followup_id: complaint.followupId,
      customer_phone: complaint.customerPhone,
      category: complaint.category,
      description: complaint.description,
      status: complaint.status,
      resolution_notes: complaint.resolutionNotes,
      created_by: complaint.createdBy,
      assigned_to: complaint.assignedTo,
      resolved_by: complaint.resolvedBy,
      resolved_at: complaint.resolvedAt,
      created_at: complaint.createdAt,
      legacy_complaint_id: complaint.legacyComplaintId,
      legacy_source: complaint.legacySource,
    };
  }

  private toDomain(row: typeof complaints.$inferSelect): Complaint {
    return Complaint.reconstitute(row.id, {
      channel: row.channel as Complaint["channel"],
      legacyOrderId: row.legacy_order_id,
      branchId: row.branch_id,
      followupId: row.followup_id,
      customerPhone: row.customer_phone,
      category: row.category as Complaint["category"],
      description: row.description,
      status: row.status as ComplaintStatus,
      resolutionNotes: row.resolution_notes,
      createdBy: row.created_by,
      assignedTo: row.assigned_to,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      legacyComplaintId: row.legacy_complaint_id,
      legacySource: row.legacy_source as Complaint["legacySource"],
    });
  }
}
