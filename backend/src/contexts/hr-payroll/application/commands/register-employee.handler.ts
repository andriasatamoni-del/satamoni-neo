import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { POSITION_REPOSITORY, type PositionRepositoryPort } from "../../domain/ports/position-repository.port";
import { DepartmentNotFoundError, PositionNotFoundError } from "../../domain/errors";

export interface RegisterEmployeeCommand {
  userId?: string | null;
  name: string;
  departmentId?: string | null;
  positionId?: string | null;
  hireDate?: Date | null;
  baseSalary?: number;
  wageType?: string;
  hourlyRate?: number | null;
  workingDaysPerMonth?: number | null;
  shift?: string | null;
  restrictedBranchId?: string | null;
  employeeCode?: string | null;
  phone?: string | null;
  notes?: string | null;
}

@Injectable()
export class RegisterEmployeeHandler {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepositoryPort
  ) {}

  async execute(command: RegisterEmployeeCommand): Promise<Employee> {
    if (command.departmentId && !(await this.departments.findById(command.departmentId))) throw new DepartmentNotFoundError();
    if (command.positionId && !(await this.positions.findById(command.positionId))) throw new PositionNotFoundError();

    const employee = Employee.register(command);
    await this.employees.save(employee);
    return employee;
  }
}
