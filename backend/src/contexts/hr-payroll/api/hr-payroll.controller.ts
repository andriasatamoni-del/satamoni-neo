import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterEmployeeHandler } from "../application/commands/register-employee.handler";
import { SetEmployeeStatusHandler } from "../application/commands/set-employee-status.handler";
import { RegisterPayrollRunHandler } from "../application/commands/register-payroll-run.handler";
import { ApprovePayrollRunHandler } from "../application/commands/approve-payroll-run.handler";
import { CancelPayrollRunHandler } from "../application/commands/cancel-payroll-run.handler";
import { DeleteDraftPayrollRunHandler } from "../application/commands/delete-draft-payroll-run.handler";
import { ListEmployeesHandler } from "../application/queries/list-employees.handler";
import { ListPayrollRunsHandler } from "../application/queries/list-payroll-runs.handler";
import { RegisterEmployeeDto } from "./dto/register-employee.dto";
import { SetEmployeeStatusDto } from "./dto/set-employee-status.dto";
import { RegisterPayrollRunDto } from "./dto/register-payroll-run.dto";
import { CancelPayrollRunDto } from "./dto/cancel-payroll-run.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { HrPayrollDomainErrorFilter } from "./filters/domain-error.filter";
import type { Employee } from "../domain/employee.aggregate";
import type { PayrollRun } from "../domain/payroll-run.aggregate";

@Controller("hr")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(HrPayrollDomainErrorFilter)
export class HrPayrollController {
  constructor(
    private readonly registerEmployee: RegisterEmployeeHandler,
    private readonly setEmployeeStatus: SetEmployeeStatusHandler,
    private readonly registerPayrollRun: RegisterPayrollRunHandler,
    private readonly approvePayrollRun: ApprovePayrollRunHandler,
    private readonly cancelPayrollRun: CancelPayrollRunHandler,
    private readonly deleteDraftPayrollRun: DeleteDraftPayrollRunHandler,
    private readonly listEmployees: ListEmployeesHandler,
    private readonly listPayrollRuns: ListPayrollRunsHandler
  ) {}

  @Get("employees")
  @RequirePermission("hr.employees.view", "hr.employees.manage")
  async employees(@Query("status") status?: string) {
    return (await this.listEmployees.execute({ status })).map(toPublicEmployee);
  }

  @Post("employees")
  @RequirePermission("hr.employees.manage")
  async createEmployee(@Body() dto: RegisterEmployeeDto) {
    return toPublicEmployee(await this.registerEmployee.execute(dto));
  }

  @Patch("employees/:id/status")
  @RequirePermission("hr.employees.manage")
  async updateEmployeeStatus(@Param("id") id: string, @Body() dto: SetEmployeeStatusDto) {
    return toPublicEmployee(
      await this.setEmployeeStatus.execute({
        employeeId: id,
        status: dto.status,
        terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : undefined,
        terminationReason: dto.terminationReason,
      })
    );
  }

  @Get("payroll-runs")
  @RequirePermission("hr.payroll.view", "hr.payroll.manage")
  async payrollRuns(@Query("status") status?: string) {
    return (await this.listPayrollRuns.execute({ status })).map(toPublicPayrollRun);
  }

  @Post("payroll-runs")
  @RequirePermission("hr.payroll.manage")
  async createPayrollRun(@Body() dto: RegisterPayrollRunDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPayrollRun(await this.registerPayrollRun.execute({ ...dto, createdBy: req.user.id }));
  }

  @Post("payroll-runs/:id/approve")
  @RequirePermission("hr.payroll.approve")
  async approve(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPayrollRun(await this.approvePayrollRun.execute({ payrollRunId: id, approvedBy: req.user.id }));
  }

  @Post("payroll-runs/:id/cancel")
  @RequirePermission("hr.payroll.approve")
  async cancel(@Param("id") id: string, @Body() dto: CancelPayrollRunDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPayrollRun(await this.cancelPayrollRun.execute({ payrollRunId: id, cancelledBy: req.user.id, reason: dto.reason }));
  }

  @Delete("payroll-runs/:id")
  @RequirePermission("hr.payroll.manage")
  async deleteDraft(@Param("id") id: string) {
    await this.deleteDraftPayrollRun.execute(id);
    return { deleted: true };
  }
}

function toPublicEmployee(employee: Employee) {
  return {
    id: employee.id,
    userId: employee.userId,
    name: employee.name,
    department: employee.department,
    jobTitle: employee.jobTitle,
    baseSalary: employee.baseSalary,
    wageType: employee.wageType,
    status: employee.status,
    terminationDate: employee.terminationDate,
    terminationReason: employee.terminationReason,
  };
}

function toPublicPayrollRun(run: PayrollRun) {
  return {
    id: run.id,
    year: run.year,
    month: run.month,
    status: run.status,
    totalNetPay: run.totalNetPay,
    employees: run.employees.map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      grossPay: e.grossPay,
      advances: e.advances,
      penalties: e.penalties,
      bonuses: e.bonuses,
      netPay: e.netPay,
    })),
    approvedAt: run.approvedAt,
    cancelledAt: run.cancelledAt,
    cancellationReason: run.cancellationReason,
  };
}
