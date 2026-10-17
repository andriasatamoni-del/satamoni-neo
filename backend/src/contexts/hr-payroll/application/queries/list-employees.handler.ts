import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeListFilter, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListEmployeesHandler {
  constructor(@Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort) {}

  async execute(filter: EmployeeListFilter = {}, page?: PageRequest): Promise<{ employees: Employee[]; total: number }> {
    return this.employees.search(filter, page);
  }
}
