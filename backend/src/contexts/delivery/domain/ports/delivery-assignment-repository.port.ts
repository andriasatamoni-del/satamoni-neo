import type { DeliveryAssignment } from "../delivery-assignment.aggregate";

export interface DeliveryAssignmentRepositoryPort {
  save(assignment: DeliveryAssignment): Promise<void>;
  findById(id: string): Promise<DeliveryAssignment | null>;
  findByOrderId(orderId: string): Promise<DeliveryAssignment | null>;
  list(filter?: { branchId?: string; driverId?: string }): Promise<DeliveryAssignment[]>;
}

export const DELIVERY_ASSIGNMENT_REPOSITORY = Symbol("DELIVERY_ASSIGNMENT_REPOSITORY");
