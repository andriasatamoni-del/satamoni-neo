import type { Employee } from "../employee.aggregate";

export interface EmployeeRepositoryPort {
  save(employee: Employee): Promise<void>;
  findById(id: string): Promise<Employee | null>;
  findByUserId(userId: string): Promise<Employee | null>;
  findByLegacyEmployeeId(legacyId: number): Promise<Employee | null>;
  list(filter?: { status?: string }): Promise<Employee[]>;
}

export const EMPLOYEE_REPOSITORY = Symbol("EMPLOYEE_REPOSITORY");
