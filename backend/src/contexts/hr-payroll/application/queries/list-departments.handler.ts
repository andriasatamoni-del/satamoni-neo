import { Inject, Injectable } from "@nestjs/common";
import { Department } from "../../domain/department.aggregate";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";

@Injectable()
export class ListDepartmentsHandler {
  constructor(@Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort) {}

  execute(filter?: { status?: string }): Promise<Department[]> {
    return this.departments.list(filter);
  }
}
