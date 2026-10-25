import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Department } from "../department.aggregate";

export interface DepartmentRepositoryPort {
  save(department: Department): Promise<void>;
  findById(id: string): Promise<Department | null>;
  findByLegacyDepartmentId(legacyId: number): Promise<Department | null>;
  existsByCode(code: string, excludeId?: string): Promise<boolean>;
  existsByName(name: string, excludeId?: string): Promise<boolean>;
  list(filter?: { status?: string }): Promise<Department[]>;
  listPage(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: Department[]; total: number }>;
}

export const DEPARTMENT_REPOSITORY = Symbol("DEPARTMENT_REPOSITORY");
