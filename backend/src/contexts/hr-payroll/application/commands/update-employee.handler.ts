import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { DEPARTMENT_REPOSITORY, type DepartmentRepositoryPort } from "../../domain/ports/department-repository.port";
import { POSITION_REPOSITORY, type PositionRepositoryPort } from "../../domain/ports/position-repository.port";
import { EmployeeNotFoundError, DepartmentNotFoundError, PositionNotFoundError, BranchTransferRequiresAdminError } from "../../domain/errors";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { EmployeeHistoryService } from "../services/employee-history.service";

export interface UpdateEmployeeCommand {
  employeeId: string;
  actorRole: string;
  name?: string;
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
  changedBy?: string | null;
  reason?: string | null;
}

// تعديل بيانات موظف موجود - كان مفيش endpoint لده خالص في neo قبل كده (updateDetails() على الأجريجيت
// معرّف بس من غير أي caller - محجوز أصلًا لإعادة الاستيراد الـidempotent). كل تغيير في
// department/position/restrictedBranchId بيتسجّل في employee_history (status بيتسجّل من
// SetEmployeeStatusHandler المنفصل - نفس فصل الريبو القديم بين PATCH الحالة والحقول التانية)
@Injectable()
export class UpdateEmployeeHandler {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort,
    @Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepositoryPort,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepositoryPort,
    private readonly employeeHistory: EmployeeHistoryService
  ) {}

  async execute(command: UpdateEmployeeCommand): Promise<Employee> {
    if (command.restrictedBranchId !== undefined && command.actorRole !== "admin") {
      throw new BranchTransferRequiresAdminError();
    }

    const employee = await this.employees.findById(command.employeeId);
    if (!employee) throw new EmployeeNotFoundError();

    if (command.departmentId && !(await this.departments.findById(command.departmentId))) throw new DepartmentNotFoundError();
    if (command.positionId && !(await this.positions.findById(command.positionId))) throw new PositionNotFoundError();

    // pay data is part of the audit evidence (who changed whose salary, from what to what)
    const pay = () => ({
      baseSalary: employee.baseSalary,
      wageType: employee.wageType,
      hourlyRate: employee.hourlyRate,
      workingDaysPerMonth: employee.workingDaysPerMonth,
      restrictedBranchId: employee.restrictedBranchId,
    });
    auditDetail({ entityType: "employees", entityId: employee.id, before: pay() });
    const before = {
      department_id: employee.departmentId,
      position_id: employee.positionId,
      restricted_branch_id: employee.restrictedBranchId,
      status: employee.status,
    };

    employee.updateDetails({
      name: command.name ?? employee.name,
      departmentId: command.departmentId,
      positionId: command.positionId,
      hireDate: command.hireDate,
      baseSalary: command.baseSalary,
      wageType: command.wageType,
      hourlyRate: command.hourlyRate,
      workingDaysPerMonth: command.workingDaysPerMonth,
      shift: command.shift,
      restrictedBranchId: command.restrictedBranchId,
      employeeCode: command.employeeCode,
      phone: command.phone,
      notes: command.notes,
    });
    await this.employees.save(employee);
    auditDetail({ after: pay() });

    await this.employeeHistory.recordChanges({
      employeeId: employee.id,
      before,
      changes: {
        department_id: command.departmentId !== undefined ? employee.departmentId : undefined,
        position_id: command.positionId !== undefined ? employee.positionId : undefined,
        restricted_branch_id: command.restrictedBranchId !== undefined ? employee.restrictedBranchId : undefined,
      },
      changedBy: command.changedBy ?? null,
      reason: command.reason ?? null,
    });

    return employee;
  }
}
