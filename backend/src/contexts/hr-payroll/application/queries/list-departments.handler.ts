import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Department } from "../../domain/department.aggregate";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";

@Injectable()
export class ListDepartmentsHandler {
  constructor(@Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort) {}

  execute(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: Department[]; total: number }> {
    return this.departments.listPage(filter, page);
  }
}
