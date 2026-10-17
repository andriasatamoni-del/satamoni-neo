import type { DeliveryAssignment } from "../delivery-assignment.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the delivery assignments list. `from`/`to` are inclusive Cairo business dates on assigned_at.
export interface DeliveryAssignmentListFilter {
  branchId?: string;
  driverId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface DeliveryAssignmentRepositoryPort {
  save(assignment: DeliveryAssignment): Promise<void>;
  findById(id: string): Promise<DeliveryAssignment | null>;
  findByOrderId(orderId: string): Promise<DeliveryAssignment | null>;
  list(filter?: { branchId?: string; driverId?: string }): Promise<DeliveryAssignment[]>;
  search(filter: DeliveryAssignmentListFilter, page?: PageRequest): Promise<{ assignments: DeliveryAssignment[]; total: number }>;
}

export const DELIVERY_ASSIGNMENT_REPOSITORY = Symbol("DELIVERY_ASSIGNMENT_REPOSITORY");
