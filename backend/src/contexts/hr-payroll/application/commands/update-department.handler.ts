import { Inject, Injectable } from "@nestjs/common";
import { Department } from "../../domain/department.aggregate";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { DepartmentNotFoundError, DuplicateDepartmentNameError } from "../../domain/errors";

export interface UpdateDepartmentCommand {
  departmentId: string;
  name?: string;
  description?: string | null;
  status?: "active" | "inactive";
}

@Injectable()
export class UpdateDepartmentHandler {
  constructor(@Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort) {}

  async execute(command: UpdateDepartmentCommand): Promise<Department> {
    const department = await this.departments.findById(command.departmentId);
    if (!department) throw new DepartmentNotFoundError();

    if (command.name !== undefined && (await this.departments.existsByName(command.name.trim(), department.id))) {
      throw new DuplicateDepartmentNameError();
    }

    department.update(command);
    await this.departments.save(department);
    return department;
  }
}
