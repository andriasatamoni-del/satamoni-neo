import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";

@Injectable()
export class ListEmployeesHandler {
  constructor(@Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort) {}

  async execute(filter?: { status?: string }): Promise<Employee[]> {
    return this.employees.list(filter);
  }
}
