import type { LeaveRequest } from "../leave-request.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the leave requests list. `restrictedBranchId` keeps requests of employees restricted to that branch;
// `from`/`to` are inclusive dates on start_date.
export interface LeaveRequestListFilter {
  employeeId?: string;
  status?: string;
  restrictedBranchId?: string;
  from?: string;
  to?: string;
}

export interface LeaveRequestRepositoryPort {
  save(request: LeaveRequest): Promise<void>;
  findById(id: string): Promise<LeaveRequest | null>;
  list(filter?: LeaveRequestListFilter, page?: PageRequest): Promise<{ requests: LeaveRequest[]; total: number }>;
}

export const LEAVE_REQUEST_REPOSITORY = Symbol("LEAVE_REQUEST_REPOSITORY");
