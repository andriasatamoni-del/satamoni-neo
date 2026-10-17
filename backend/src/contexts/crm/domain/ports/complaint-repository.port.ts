import type { Complaint, ComplaintStatus } from "../complaint.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the complaints list. `q` matches the customer phone or description; `from`/`to` are Cairo dates on created_at.
export interface ComplaintListFilter {
  status?: ComplaintStatus;
  branchId?: string;
  q?: string;
  from?: string;
  to?: string;
}

export interface ComplaintRepositoryPort {
  save(complaint: Complaint): Promise<void>;
  findById(id: string): Promise<Complaint | null>;
  list(filter?: ComplaintListFilter, page?: PageRequest): Promise<{ complaints: Complaint[]; total: number }>;
  findLatestByPhone(phone: string): Promise<Complaint | null>;
  findByLegacyComplaintId(
    legacySource: "customer_complaints" | "whatsapp_complaints",
    legacyComplaintId: number
  ): Promise<Complaint | null>;
}

export const COMPLAINT_REPOSITORY = Symbol("COMPLAINT_REPOSITORY");
