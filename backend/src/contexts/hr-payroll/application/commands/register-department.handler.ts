import { Inject, Injectable } from "@nestjs/common";
import { Department } from "../../domain/department.aggregate";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { DuplicateDepartmentCodeError, DuplicateDepartmentNameError } from "../../domain/errors";

export interface RegisterDepartmentCommand {
  code: string;
  name: string;
  description?: string | null;
}

@Injectable()
export class RegisterDepartmentHandler {
  constructor(@Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort) {}

  async execute(command: RegisterDepartmentCommand): Promise<Department> {
    if (await this.departments.existsByCode(command.code.trim())) throw new DuplicateDepartmentCodeError();
    if (await this.departments.existsByName(command.name.trim())) throw new DuplicateDepartmentNameError();

    const department = Department.register(command);
    await this.departments.save(department);
    return department;
  }
}
