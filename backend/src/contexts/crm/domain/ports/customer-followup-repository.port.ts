import type { CustomerFollowup } from "../customer-followup.aggregate";

export interface CustomerFollowupRepositoryPort {
  save(followup: CustomerFollowup): Promise<void>;
  findById(id: string): Promise<CustomerFollowup | null>;
  findByLegacyOrderId(legacyOrderId: number): Promise<CustomerFollowup | null>;
  findByLegacyFollowupId(legacyFollowupId: number): Promise<CustomerFollowup | null>;
}

export const CUSTOMER_FOLLOWUP_REPOSITORY = Symbol("CUSTOMER_FOLLOWUP_REPOSITORY");
