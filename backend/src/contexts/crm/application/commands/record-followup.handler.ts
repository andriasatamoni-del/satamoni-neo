import { Inject, Injectable } from "@nestjs/common";
import { CustomerFollowup } from "../../domain/customer-followup.aggregate";
import { Complaint } from "../../domain/complaint.aggregate";
import {
  CUSTOMER_FOLLOWUP_REPOSITORY,
  type CustomerFollowupRepositoryPort,
} from "../../domain/ports/customer-followup-repository.port";
import { COMPLAINT_REPOSITORY, type ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";

export interface RecordFollowupCommand {
  orderId?: string | null;
  legacyOrderId?: number | null;
  branchId?: string | null;
  customerPhone: string;
  callResult: string;
  satisfactionRating?: string | null;
  notes?: string | null;
  hasComplaint?: boolean;
  complaint?: {
    category: string;
    description?: string | null;
    status?: string;
    resolutionNotes?: string | null;
  };
  actingUserId: string;
}

export interface RecordFollowupResult {
  followup: CustomerFollowup;
  complaint: Complaint | null;
}

// نفس منطق POST /api/crm/followups في الريبو القديم بالظبط: صف واحد بس لكل legacyOrderId (محاولة
// تانية بتحدّث نفس الصف)، وممكن يترفق شكوى وقتها لو hasComplaint. الفرق: branch_id/customer_phone هنا
// بييجوا من الطلب نفسه بدل ما يتقروا من جدول orders (Orders context لسه ما اتبناش - راجع تعليق
// migration 002_create_crm_tables)
@Injectable()
export class RecordFollowupHandler {
  constructor(
    @Inject(CUSTOMER_FOLLOWUP_REPOSITORY) private readonly followups: CustomerFollowupRepositoryPort,
    @Inject(COMPLAINT_REPOSITORY) private readonly complaints: ComplaintRepositoryPort
  ) {}

  async execute(command: RecordFollowupCommand): Promise<RecordFollowupResult> {
    const existing = command.orderId
      ? await this.followups.findByOrderId(command.orderId)
      : command.legacyOrderId != null
        ? await this.followups.findByLegacyOrderId(command.legacyOrderId)
        : null;

    let followup: CustomerFollowup;
    if (existing) {
      existing.recordCall({
        callResult: command.callResult,
        satisfactionRating: command.satisfactionRating,
        notes: command.notes,
        hasComplaint: command.hasComplaint,
        calledBy: command.actingUserId,
      });
      followup = existing;
    } else {
      followup = CustomerFollowup.register({
        orderId: command.orderId,
        legacyOrderId: command.legacyOrderId,
        branchId: command.branchId,
        customerPhone: command.customerPhone,
        callResult: command.callResult,
        satisfactionRating: command.satisfactionRating,
        notes: command.notes,
        hasComplaint: command.hasComplaint,
        calledBy: command.actingUserId,
      });
    }
    await this.followups.save(followup);

    let complaint: Complaint | null = null;
    if (command.hasComplaint && command.complaint) {
      complaint = Complaint.register({
        channel: "phone_followup",
        legacyOrderId: command.legacyOrderId,
        branchId: command.branchId,
        followupId: followup.id,
        customerPhone: command.customerPhone,
        category: command.complaint.category,
        description: command.complaint.description,
        status: command.complaint.status,
        resolutionNotes: command.complaint.resolutionNotes,
        createdBy: command.actingUserId,
      });
      await this.complaints.save(complaint);
    }

    return { followup, complaint };
  }
}
