import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Employee, type WageType, type EmployeeStatus } from "../../domain/employee.aggregate";
import type { EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { employees } from "./hr-payroll.tables";

@Injectable()
export class EmployeeRepository implements EmployeeRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(employee: Employee): Promise<void> {
    const row = this.toRow(employee);
    await this.db
      .insert(employees)
      .values(row)
      .onConflictDoUpdate({
        target: employees.id,
        set: {
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
        },
      });
  }

  async findById(id: string): Promise<Employee | null> {
    const [row] = await this.db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyEmployeeId(legacyId: number): Promise<Employee | null> {
    const [row] = await this.db.select().from(employees).where(eq(employees.legacy_employee_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByUserId(userId: string): Promise<Employee | null> {
    const [row] = await this.db.select().from(employees).where(eq(employees.user_id, userId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { status?: string }): Promise<Employee[]> {
    const rows = await this.db
      .select()
      .from(employees)
      .where(filter?.status ? eq(employees.status, filter.status) : undefined)
      .orderBy(asc(employees.name));
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

  private toDomain(row: typeof employees.$inferSelect): Employee {
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
