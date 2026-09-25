import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Employee, type WageType, type EmployeeStatus } from "../../domain/employee.aggregate";
import type { EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import type { EmployeesTable } from "./hr-payroll.schema";

@Injectable()
export class KyselyEmployeeRepository implements EmployeeRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(employee: Employee): Promise<void> {
    const row = this.toRow(employee);
    await this.db
      .insertInto("employees")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          department_id: row.department_id,
          position_id: row.position_id,
          hire_date: row.hire_date,
          base_salary: row.base_salary,
          wage_type: row.wage_type,
          hourly_rate: row.hourly_rate,
          working_days_per_month: row.working_days_per_month,
          shift: row.shift,
          restricted_branch_id: row.restricted_branch_id,
          employee_code: row.employee_code,
          phone: row.phone,
          notes: row.notes,
          status: row.status,
          termination_date: row.termination_date,
          termination_reason: row.termination_reason,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Employee | null> {
    const row = await this.db.selectFrom("employees").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyEmployeeId(legacyId: number): Promise<Employee | null> {
    const row = await this.db.selectFrom("employees").selectAll().where("legacy_employee_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByUserId(userId: string): Promise<Employee | null> {
    const row = await this.db.selectFrom("employees").selectAll().where("user_id", "=", userId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { status?: string }): Promise<Employee[]> {
    let query = this.db.selectFrom("employees").selectAll();
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(employee: Employee) {
    return {
      id: employee.id,
      user_id: employee.userId,
      name: employee.name,
      department_id: employee.departmentId,
      position_id: employee.positionId,
      hire_date: employee.hireDate,
      base_salary: employee.baseSalary,
      wage_type: employee.wageType,
      hourly_rate: employee.hourlyRate,
      working_days_per_month: employee.workingDaysPerMonth,
      shift: employee.shift,
      restricted_branch_id: employee.restrictedBranchId,
      employee_code: employee.employeeCode,
      phone: employee.phone,
      notes: employee.notes,
      status: employee.status,
      termination_date: employee.terminationDate,
      termination_reason: employee.terminationReason,
      legacy_employee_id: employee.legacyEmployeeId,
      created_at: employee.createdAt,
    };
  }

  private toDomain(row: Selectable<EmployeesTable>): Employee {
    return Employee.reconstitute(row.id, {
      userId: row.user_id,
      name: row.name,
      departmentId: row.department_id,
      positionId: row.position_id,
      hireDate: row.hire_date,
      baseSalary: Number(row.base_salary),
      wageType: row.wage_type as WageType,
      hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
      workingDaysPerMonth: row.working_days_per_month,
      shift: row.shift,
      restrictedBranchId: row.restricted_branch_id,
      employeeCode: row.employee_code,
      phone: row.phone,
      notes: row.notes,
      status: row.status as EmployeeStatus,
      terminationDate: row.termination_date,
      terminationReason: row.termination_reason,
      legacyEmployeeId: row.legacy_employee_id,
      createdAt: row.created_at,
    });
  }
}
