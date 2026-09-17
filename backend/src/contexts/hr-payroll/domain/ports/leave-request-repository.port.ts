import type { LeaveRequest } from "../leave-request.aggregate";

export interface LeaveRequestRepositoryPort {
  save(request: LeaveRequest): Promise<void>;
  findById(id: string): Promise<LeaveRequest | null>;
  list(filter?: { employeeId?: string; status?: string }): Promise<LeaveRequest[]>;
}

export const LEAVE_REQUEST_REPOSITORY = Symbol("LEAVE_REQUEST_REPOSITORY");
