import type { Department } from "../department.aggregate";

export interface DepartmentRepositoryPort {
  save(department: Department): Promise<void>;
  findById(id: string): Promise<Department | null>;
  findByLegacyDepartmentId(legacyId: number): Promise<Department | null>;
  existsByCode(code: string, excludeId?: string): Promise<boolean>;
  existsByName(name: string, excludeId?: string): Promise<boolean>;
  list(filter?: { status?: string }): Promise<Department[]>;
}

export const DEPARTMENT_REPOSITORY = Symbol("DEPARTMENT_REPOSITORY");
