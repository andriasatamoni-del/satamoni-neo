import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeNotFoundError } from "../../domain/errors";

export interface SetEmployeeStatusCommand {
  employeeId: string;
  status: string;
  terminationDate?: Date | null;
  terminationReason?: string | null;
}

@Injectable()
export class SetEmployeeStatusHandler {
  constructor(@Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort) {}

  async execute(command: SetEmployeeStatusCommand): Promise<Employee> {
    const employee = await this.employees.findById(command.employeeId);
    if (!employee) throw new EmployeeNotFoundError();

    if (command.status === "terminated") {
      employee.terminate({ date: command.terminationDate ?? new Date(), reason: command.terminationReason });
    } else {
      employee.setStatus(command.status);
    }
    await this.employees.save(employee);
    return employee;
  }
}
