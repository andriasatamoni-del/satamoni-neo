import type { Complaint, ComplaintStatus } from "../complaint.aggregate";

export interface ComplaintRepositoryPort {
  save(complaint: Complaint): Promise<void>;
  findById(id: string): Promise<Complaint | null>;
  list(filter?: { status?: ComplaintStatus }): Promise<Complaint[]>;
  findLatestByPhone(phone: string): Promise<Complaint | null>;
  findByLegacyComplaintId(
    legacySource: "customer_complaints" | "whatsapp_complaints",
    legacyComplaintId: number
  ): Promise<Complaint | null>;
}

export const COMPLAINT_REPOSITORY = Symbol("COMPLAINT_REPOSITORY");
