import type { Employee } from "../employee.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the employees list. `restrictedBranchId` keeps only employees restricted to that branch.
export interface EmployeeListFilter {
  status?: string;
  departmentId?: string;
  restrictedBranchId?: string;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface EmployeeRepositoryPort {
  save(employee: Employee): Promise<void>;
  findById(id: string): Promise<Employee | null>;
  findByUserId(userId: string): Promise<Employee | null>;
  findByLegacyEmployeeId(legacyId: number): Promise<Employee | null>;
  list(filter?: { status?: string }): Promise<Employee[]>;
  search(filter: EmployeeListFilter, page?: PageRequest): Promise<{ employees: Employee[]; total: number }>;
}

export const EMPLOYEE_REPOSITORY = Symbol("EMPLOYEE_REPOSITORY");
