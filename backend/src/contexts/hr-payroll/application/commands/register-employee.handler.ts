import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";

export interface RegisterEmployeeCommand {
  userId?: string | null;
  name: string;
  department?: string | null;
  jobTitle?: string | null;
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
  constructor(@Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort) {}

  async execute(command: RegisterEmployeeCommand): Promise<Employee> {
    const employee = Employee.register(command);
    await this.employees.save(employee);
    return employee;
  }
}
