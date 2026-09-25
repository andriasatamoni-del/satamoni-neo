import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { POSITION_REPOSITORY, type PositionRepositoryPort } from "../../domain/ports/position-repository.port";
import { EmployeeProfileNotLinkedError } from "../../domain/errors";

export interface OwnEmployeeProfileView {
  employee: Employee;
  departmentName: string | null;
  positionName: string | null;
}

@Injectable()
export class GetOwnEmployeeProfileHandler {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepositoryPort
  ) {}

  async execute(userId: string): Promise<OwnEmployeeProfileView> {
    const employee = await this.employees.findByUserId(userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();

    const departmentName = employee.departmentId ? (await this.departments.findById(employee.departmentId))?.name ?? null : null;
    const positionName = employee.positionId ? (await this.positions.findById(employee.positionId))?.name ?? null : null;
    return { employee, departmentName, positionName };
  }
}
