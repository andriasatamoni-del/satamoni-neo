import { Body, Controller, ForbiddenException, Delete, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterEmployeeHandler } from "../application/commands/register-employee.handler";
import { UpdateEmployeeHandler } from "../application/commands/update-employee.handler";
import { SetEmployeeStatusHandler } from "../application/commands/set-employee-status.handler";
import { EmployeeHistoryService } from "../application/services/employee-history.service";
import { RegisterDepartmentHandler } from "../application/commands/register-department.handler";
import { UpdateDepartmentHandler } from "../application/commands/update-department.handler";
import { RegisterPositionHandler } from "../application/commands/register-position.handler";
import { UpdatePositionHandler } from "../application/commands/update-position.handler";
import { ListDepartmentsHandler } from "../application/queries/list-departments.handler";
import { ListPositionsHandler } from "../application/queries/list-positions.handler";
import { RegisterPayrollRunHandler } from "../application/commands/register-payroll-run.handler";
import { ApprovePayrollRunHandler } from "../application/commands/approve-payroll-run.handler";
import { CancelPayrollRunHandler } from "../application/commands/cancel-payroll-run.handler";
import { DeleteDraftPayrollRunHandler } from "../application/commands/delete-draft-payroll-run.handler";
import { RegisterLeaveRequestHandler } from "../application/commands/register-leave-request.handler";
import { CancelLeaveRequestHandler } from "../application/commands/cancel-leave-request.handler";
import { ReviewLeaveRequestHandler } from "../application/commands/review-leave-request.handler";
import { CheckInEmployeeHandler } from "../application/commands/check-in-employee.handler";
import { CheckOutEmployeeHandler } from "../application/commands/check-out-employee.handler";
import { ListEmployeesHandler } from "../application/queries/list-employees.handler";
import { ListPayrollRunsHandler } from "../application/queries/list-payroll-runs.handler";
import { GetOwnEmployeeProfileHandler } from "../application/queries/get-own-employee-profile.handler";
import { ListOwnPayslipsHandler } from "../application/queries/list-own-payslips.handler";
import { ListOwnLeaveRequestsHandler } from "../application/queries/list-own-leave-requests.handler";
import { ListLeaveRequestsHandler } from "../application/queries/list-leave-requests.handler";
import { ListOwnAttendanceShiftsHandler } from "../application/queries/list-own-attendance-shifts.handler";
import { RegisterPayrollAdjustmentHandler } from "../application/commands/register-payroll-adjustment.handler";
import { CancelPayrollAdjustmentHandler } from "../application/commands/cancel-payroll-adjustment.handler";
import { ListPayrollAdjustmentsHandler } from "../application/queries/list-payroll-adjustments.handler";
import { RegisterEmployeeDto } from "./dto/register-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { SetEmployeeStatusDto } from "./dto/set-employee-status.dto";
import { RegisterDepartmentDto } from "./dto/register-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { RegisterPositionDto } from "./dto/register-position.dto";
import { UpdatePositionDto } from "./dto/update-position.dto";
import { RegisterPayrollRunDto } from "./dto/register-payroll-run.dto";
import { CancelPayrollRunDto } from "./dto/cancel-payroll-run.dto";
import { RegisterLeaveRequestDto } from "./dto/register-leave-request.dto";
import { ReviewLeaveRequestDto } from "./dto/review-leave-request.dto";
import { CheckInEmployeeDto } from "./dto/check-in-employee.dto";
import { CheckOutEmployeeDto } from "./dto/check-out-employee.dto";
import { RegisterPayrollAdjustmentDto } from "./dto/register-payroll-adjustment.dto";
import { CancelPayrollAdjustmentDto } from "./dto/cancel-payroll-adjustment.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { BranchScopeGuard, BranchScoped, BranchResource, CompanyWideOnly, branchScopeOf } from "../../../shared/authorization/branch-scope";
import { HrPayrollDomainErrorFilter } from "./filters/domain-error.filter";
import type { Employee } from "../domain/employee.aggregate";
import type { Department } from "../domain/department.aggregate";
import type { Position } from "../domain/position.aggregate";
import type { PayrollRun } from "../domain/payroll-run.aggregate";
import type { LeaveRequest } from "../domain/leave-request.aggregate";
import type { EmployeeAttendanceShift } from "../domain/employee-attendance-shift.aggregate";
import type { PayrollAdjustment } from "../domain/payroll-adjustment.aggregate";

@Controller("hr")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@UseFilters(HrPayrollDomainErrorFilter)
export class HrPayrollController {
  constructor(
    private readonly registerEmployee: RegisterEmployeeHandler,
    private readonly updateEmployee: UpdateEmployeeHandler,
    private readonly setEmployeeStatus: SetEmployeeStatusHandler,
    private readonly employeeHistory: EmployeeHistoryService,
    private readonly registerDepartment: RegisterDepartmentHandler,
    private readonly updateDepartment: UpdateDepartmentHandler,
    private readonly registerPosition: RegisterPositionHandler,
    private readonly updatePosition: UpdatePositionHandler,
    private readonly listDepartments: ListDepartmentsHandler,
    private readonly listPositions: ListPositionsHandler,
    private readonly registerPayrollRun: RegisterPayrollRunHandler,
    private readonly approvePayrollRun: ApprovePayrollRunHandler,
    private readonly cancelPayrollRun: CancelPayrollRunHandler,
    private readonly deleteDraftPayrollRun: DeleteDraftPayrollRunHandler,
    private readonly registerLeaveRequest: RegisterLeaveRequestHandler,
    private readonly cancelLeaveRequest: CancelLeaveRequestHandler,
    private readonly reviewLeaveRequest: ReviewLeaveRequestHandler,
    private readonly checkInEmployee: CheckInEmployeeHandler,
    private readonly checkOutEmployee: CheckOutEmployeeHandler,
    private readonly listEmployees: ListEmployeesHandler,
    private readonly listPayrollRuns: ListPayrollRunsHandler,
    private readonly getOwnEmployeeProfile: GetOwnEmployeeProfileHandler,
    private readonly listOwnPayslips: ListOwnPayslipsHandler,
    private readonly listOwnLeaveRequests: ListOwnLeaveRequestsHandler,
    private readonly listLeaveRequests: ListLeaveRequestsHandler,
    private readonly listOwnAttendanceShifts: ListOwnAttendanceShiftsHandler,
    private readonly registerPayrollAdjustment: RegisterPayrollAdjustmentHandler,
    private readonly cancelPayrollAdjustment: CancelPayrollAdjustmentHandler,
    private readonly listPayrollAdjustments: ListPayrollAdjustmentsHandler
  ) {}

  @BranchScoped()
  @Get("employees")
  @RequirePermission("hr.employees.view", "hr.employees.manage")
  async employees(@Req() req: Request & { user: AuthenticatedUser }, @Query("status") status?: string) {
    const scope = branchScopeOf(req.user);
    const all = await this.listEmployees.execute({ status });
    if (scope.kind === "all") return all.map((e) => toPublicEmployee(e));
    // branch-bound: only the employees restricted to the caller's own branch, WITHOUT any salary data
    const own = scope.kind === "branch" ? all.filter((e) => e.restrictedBranchId === scope.branchId) : [];
    return own.map((e) => toPublicEmployee(e, true));
  }

  @BranchScoped()
  @Post("employees")
  @RequirePermission("hr.employees.manage")
  async createEmployee(@Body() dto: RegisterEmployeeDto, @Req() req: Request & { user: AuthenticatedUser }) {
    this.assertBranchBoundEmployeeRules(req.user, dto);
    const scope = branchScopeOf(req.user);
    // a branch-bound user can only create employees of its own branch
    if (scope.kind === "branch") dto.restrictedBranchId = scope.branchId;
    return toPublicEmployee(await this.registerEmployee.execute(dto), scope.kind !== "all");
  }

  @BranchScoped()
  @BranchResource("employees", { column: "restricted_branch_id" })
  @Patch("employees/:id")
  @RequirePermission("hr.employees.manage")
  async updateEmployeeRoute(@Param("id") id: string, @Body() dto: UpdateEmployeeDto, @Req() req: Request & { user: AuthenticatedUser }) {
    this.assertBranchBoundEmployeeRules(req.user, dto);
    return toPublicEmployee(
      await this.updateEmployee.execute({
        employeeId: id,
        actorRole: req.user.role,
        ...dto,
        changedBy: req.user.id,
      })
    );
  }

  @BranchScoped()
  @BranchResource("employees", { column: "restricted_branch_id" })
  @Patch("employees/:id/status")
  @RequirePermission("hr.employees.manage")
  async updateEmployeeStatus(@Param("id") id: string, @Body() dto: SetEmployeeStatusDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const { employee, terminationCascade } = await this.setEmployeeStatus.execute({
      employeeId: id,
      status: dto.status,
      terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : undefined,
      terminationReason: dto.terminationReason,
      reason: dto.reason,
      acknowledgeBlockers: dto.acknowledgeBlockers,
      changedBy: req.user.id,
    });
    return { ...toPublicEmployee(employee, branchScopeOf(req.user).kind !== "all"), terminationCascade: terminationCascade ?? undefined };
  }

  // سجل التغييرات الجوهرية لموظف واحد (فرع/قسم/وظيفة/حالة) - نفس GET /api/hr/employees/:id/history
  // بالريبو القديم بالظبط
  @BranchScoped()
  @BranchResource("employees", { column: "restricted_branch_id" })
  @Get("employees/:id/history")
  @RequirePermission("hr.employees.view", "hr.employees.manage")
  async employeeHistoryRoute(@Param("id") id: string) {
    return this.employeeHistory.listByEmployee(id);
  }

  // الهيكل التنظيمي - أقسام ومسميات وظيفية حقيقية (نفس فلسفة HRF-6 بالريبو القديم بالحرف) بدل ما تكون
  // نص حر على employees.department/job_title
  @Get("departments")
  @RequirePermission("hr.employees.view", "hr.employees.manage")
  async departments(@Query("status") status?: string) {
    return (await this.listDepartments.execute({ status })).map(toPublicDepartment);
  }

  @Post("departments")
  @RequirePermission("hr.organization.manage")
  async createDepartment(@Body() dto: RegisterDepartmentDto) {
    return toPublicDepartment(await this.registerDepartment.execute(dto));
  }

  @Patch("departments/:id")
  @RequirePermission("hr.organization.manage")
  async updateDepartmentHandler(@Param("id") id: string, @Body() dto: UpdateDepartmentDto) {
    return toPublicDepartment(await this.updateDepartment.execute({ departmentId: id, ...dto }));
  }

  @Get("positions")
  @RequirePermission("hr.employees.view", "hr.employees.manage")
  async positions(@Query("status") status?: string, @Query("departmentId") departmentId?: string) {
    return (await this.listPositions.execute({ status, departmentId })).map(toPublicPosition);
  }

  @Post("positions")
  @RequirePermission("hr.organization.manage")
  async createPosition(@Body() dto: RegisterPositionDto) {
    return toPublicPosition(await this.registerPosition.execute(dto));
  }

  @Patch("positions/:id")
  @RequirePermission("hr.organization.manage")
  async updatePositionHandler(@Param("id") id: string, @Body() dto: UpdatePositionDto) {
    return toPublicPosition(await this.updatePosition.execute({ positionId: id, ...dto }));
  }

  @CompanyWideOnly()
  @Get("payroll-runs")
  @RequirePermission("hr.payroll.view", "hr.payroll.manage")
  async payrollRuns(@Query("status") status?: string) {
    return (await this.listPayrollRuns.execute({ status })).map(toPublicPayrollRun);
  }

  @CompanyWideOnly()
  @Post("payroll-runs")
  @RequirePermission("hr.payroll.manage")
  async createPayrollRun(@Body() dto: RegisterPayrollRunDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPayrollRun(await this.registerPayrollRun.execute({ ...dto, createdBy: req.user.id }));
  }

  @CompanyWideOnly()
  @Post("payroll-runs/:id/approve")
  @RequirePermission("hr.payroll.approve")
  async approve(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPayrollRun(await this.approvePayrollRun.execute({ payrollRunId: id, approvedBy: req.user.id }));
  }

  @CompanyWideOnly()
  @Post("payroll-runs/:id/cancel")
  @RequirePermission("hr.payroll.approve")
  async cancel(@Param("id") id: string, @Body() dto: CancelPayrollRunDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPayrollRun(await this.cancelPayrollRun.execute({ payrollRunId: id, cancelledBy: req.user.id, reason: dto.reason }));
  }

  @CompanyWideOnly()
  @Delete("payroll-runs/:id")
  @RequirePermission("hr.payroll.manage")
  async deleteDraft(@Param("id") id: string) {
    await this.deleteDraftPayrollRun.execute(id);
    return { deleted: true };
  }

  // بوابة الخدمة الذاتية - أي دور (حتى غير "employee") ممكن يشوف بياناته لو حسابه مربوط بملف موظف
  // (employees.user_id) - نفس فلسفة "زر بياناتي" الموجود في كل شاشة في الريبو القديم
  @Get("self/profile")
  @RequirePermission("hr.self.view")
  async ownProfile(@Req() req: Request & { user: AuthenticatedUser }) {
    const { employee, departmentName, positionName } = await this.getOwnEmployeeProfile.execute(req.user.id);
    return { ...toPublicEmployee(employee), departmentName, positionName };
  }

  @Get("self/payslips")
  @RequirePermission("hr.self.view")
  async ownPayslips(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.listOwnPayslips.execute(req.user.id);
  }

  @Get("self/leave-requests")
  @RequirePermission("hr.self.leave.manage")
  async ownLeaveRequests(@Req() req: Request & { user: AuthenticatedUser }) {
    return (await this.listOwnLeaveRequests.execute(req.user.id)).map(toPublicLeaveRequest);
  }

  @Post("self/leave-requests")
  @RequirePermission("hr.self.leave.manage")
  async createOwnLeaveRequest(@Body() dto: RegisterLeaveRequestDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicLeaveRequest(
      await this.registerLeaveRequest.execute({
        userId: req.user.id,
        leaveType: dto.leaveType,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
      })
    );
  }

  @Post("self/leave-requests/:id/cancel")
  @RequirePermission("hr.self.leave.manage")
  async cancelOwnLeaveRequest(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicLeaveRequest(await this.cancelLeaveRequest.execute({ userId: req.user.id, leaveRequestId: id }));
  }

  @Get("self/attendance")
  @RequirePermission("hr.self.view")
  async ownAttendance(@Req() req: Request & { user: AuthenticatedUser }) {
    return (await this.listOwnAttendanceShifts.execute(req.user.id)).map(toPublicAttendanceShift);
  }

  @Post("self/attendance/check-in")
  @RequirePermission("hr.self.view")
  async checkIn(@Body() dto: CheckInEmployeeDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAttendanceShift(await this.checkInEmployee.execute({ userId: req.user.id, branchId: dto.branchId }));
  }

  @Post("self/attendance/:id/check-out")
  @RequirePermission("hr.self.view")
  async checkOut(@Param("id") id: string, @Body() dto: CheckOutEmployeeDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAttendanceShift(
      await this.checkOutEmployee.execute({ userId: req.user.id, shiftId: id, notes: dto.notes })
    );
  }

  // مراجعة طلبات الإجازة (جانب الإدارة) - hr.leave.review
  @BranchScoped()
  @Get("leave-requests")
  @RequirePermission("hr.leave.review")
  async leaveRequests(@Req() req: Request & { user: AuthenticatedUser }, @Query("status") status?: string) {
    const requests = await this.listLeaveRequests.execute({ status });
    const scope = branchScopeOf(req.user);
    if (scope.kind === "all") return requests.map(toPublicLeaveRequest);
    // branch-bound: only requests of employees restricted to the caller's own branch
    const own = new Set(
      scope.kind === "branch" ? (await this.listEmployees.execute({})).filter((e) => e.restrictedBranchId === scope.branchId).map((e) => e.id) : []
    );
    return requests.filter((r) => own.has(r.employeeId)).map(toPublicLeaveRequest);
  }

  @BranchScoped()
  @BranchResource("employee_leave_requests", { through: { column: "employee_id", table: "employees", branchColumn: "restricted_branch_id" } })
  @Post("leave-requests/:id/review")
  @RequirePermission("hr.leave.review")
  async reviewLeave(@Param("id") id: string, @Body() dto: ReviewLeaveRequestDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicLeaveRequest(
      await this.reviewLeaveRequest.execute({
        leaveRequestId: id,
        decision: dto.decision,
        notes: dto.notes,
        reviewerId: req.user.id,
      })
    );
  }

  // سلف/جزاءات/مكافآت فردية - راجع تعليق payroll-adjustment.aggregate.ts
  @CompanyWideOnly()
  @Get("adjustments")
  @RequirePermission("hr.payroll.view", "hr.payroll.adjustments.manage")
  async adjustments(@Query("employeeId") employeeId?: string, @Query("status") status?: string) {
    return (await this.listPayrollAdjustments.execute({ employeeId, status })).map(toPublicAdjustment);
  }

  @CompanyWideOnly()
  @Post("adjustments")
  @RequirePermission("hr.payroll.adjustments.manage")
  async createAdjustment(@Body() dto: RegisterPayrollAdjustmentDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAdjustment(
      await this.registerPayrollAdjustment.execute({
        employeeId: dto.employeeId,
        entryDate: new Date(dto.entryDate),
        adjustmentType: dto.adjustmentType,
        amount: dto.amount,
        notes: dto.notes,
        createdBy: req.user.id,
      })
    );
  }

  @CompanyWideOnly()
  @Post("adjustments/:id/cancel")
  @RequirePermission("hr.payroll.adjustments.manage")
  async cancelAdjustment(@Param("id") id: string, @Body() dto: CancelPayrollAdjustmentDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAdjustment(
      await this.cancelPayrollAdjustment.execute({ adjustmentId: id, reason: dto.reason, cancelledBy: req.user.id })
    );
  }

  // branch-bound HR users manage only employees of their own branch and can never see/change pay data or move staff between branches
  private assertBranchBoundEmployeeRules(user: AuthenticatedUser, dto: { restrictedBranchId?: string; baseSalary?: number; hourlyRate?: number; wageType?: string }): void {
    const scope = branchScopeOf(user);
    if (scope.kind === "all") return;
    if (scope.kind === "none" || (dto.restrictedBranchId !== undefined && dto.restrictedBranchId !== scope.branchId)) {
      throw new ForbiddenException("معندكش صلاحية على موظفين فرع تاني");
    }
    if (dto.baseSalary !== undefined || dto.hourlyRate !== undefined || dto.wageType !== undefined) {
      throw new ForbiddenException("تعديل الراتب/الأجر على مستوى الشركة بس");
    }
  }
}

function toPublicEmployee(employee: Employee, hideSalary = false) {
  return {
    id: employee.id,
    userId: employee.userId,
    name: employee.name,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    hireDate: employee.hireDate,
    baseSalary: hideSalary ? null : employee.baseSalary,
    wageType: hideSalary ? null : employee.wageType,
    hourlyRate: hideSalary ? null : employee.hourlyRate,
    workingDaysPerMonth: employee.workingDaysPerMonth,
    shift: employee.shift,
    restrictedBranchId: employee.restrictedBranchId,
    employeeCode: employee.employeeCode,
    phone: employee.phone,
    notes: employee.notes,
    status: employee.status,
    terminationDate: employee.terminationDate,
    terminationReason: employee.terminationReason,
  };
}

function toPublicDepartment(department: Department) {
  return {
    id: department.id,
    code: department.code,
    name: department.name,
    description: department.description,
    status: department.status,
  };
}

function toPublicPosition(position: Position) {
  return {
    id: position.id,
    code: position.code,
    name: position.name,
    departmentId: position.departmentId,
    description: position.description,
    status: position.status,
  };
}

function toPublicLeaveRequest(request: LeaveRequest) {
  return {
    id: request.id,
    employeeId: request.employeeId,
    leaveType: request.leaveType,
    startDate: request.startDate,
    endDate: request.endDate,
    days: request.days,
    reason: request.reason,
    status: request.status,
    reviewedBy: request.reviewedBy,
    reviewedAt: request.reviewedAt,
    reviewNotes: request.reviewNotes,
    createdAt: request.createdAt,
  };
}

function toPublicAttendanceShift(shift: EmployeeAttendanceShift) {
  return {
    id: shift.id,
    employeeId: shift.employeeId,
    branchId: shift.branchId,
    status: shift.status,
    checkedInAt: shift.checkedInAt,
    checkedOutAt: shift.checkedOutAt,
    hoursWorked: shift.hoursWorked,
    notes: shift.notes,
  };
}

function toPublicAdjustment(adjustment: PayrollAdjustment) {
  return {
    id: adjustment.id,
    employeeId: adjustment.employeeId,
    entryDate: adjustment.entryDate,
    adjustmentType: adjustment.adjustmentType,
    amount: adjustment.amount,
    notes: adjustment.notes,
    status: adjustment.status,
    createdBy: adjustment.createdBy,
    createdAt: adjustment.createdAt,
    cancelledBy: adjustment.cancelledBy,
    cancelledAt: adjustment.cancelledAt,
    cancellationReason: adjustment.cancellationReason,
    payrollRunId: adjustment.payrollRunId,
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
