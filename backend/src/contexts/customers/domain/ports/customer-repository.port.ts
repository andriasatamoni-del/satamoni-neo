import type { Customer } from "../customer.aggregate";

export interface CustomerRepositoryPort {
  save(customer: Customer): Promise<void>;
  findById(id: string): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  findByLegacyCustomerId(legacyId: number): Promise<Customer | null>;
}

export const CUSTOMER_REPOSITORY = Symbol("CUSTOMER_REPOSITORY");
