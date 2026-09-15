import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Complaint, type ComplaintStatus } from "../../domain/complaint.aggregate";
import type { ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";
import type { ComplaintsTable } from "./complaint.schema";

@Injectable()
export class KyselyComplaintRepository implements ComplaintRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(complaint: Complaint): Promise<void> {
    const row = this.toRow(complaint);
    await this.db
      .insertInto("complaints")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
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
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Complaint | null> {
    const row = await this.db.selectFrom("complaints").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { status?: ComplaintStatus }): Promise<Complaint[]> {
    let query = this.db.selectFrom("complaints").selectAll();
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  async findLatestByPhone(phone: string): Promise<Complaint | null> {
    const row = await this.db
      .selectFrom("complaints")
      .selectAll()
      .where("customer_phone", "=", phone)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyComplaintId(
    legacySource: "customer_complaints" | "whatsapp_complaints",
    legacyComplaintId: number
  ): Promise<Complaint | null> {
    const row = await this.db
      .selectFrom("complaints")
      .selectAll()
      .where("legacy_source", "=", legacySource)
      .where("legacy_complaint_id", "=", legacyComplaintId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  private toRow(complaint: Complaint) {
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

  private toDomain(row: Selectable<ComplaintsTable>): Complaint {
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
