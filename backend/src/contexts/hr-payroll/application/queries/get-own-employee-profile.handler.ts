import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeProfileNotLinkedError } from "../../domain/errors";

@Injectable()
export class GetOwnEmployeeProfileHandler {
  constructor(@Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort) {}

  async execute(userId: string): Promise<Employee> {
    const employee = await this.employees.findByUserId(userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();
    return employee;
  }
}
