import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { ROLES } from "../identity-access/domain/role";
import { EMPLOYEE_REPOSITORY } from "./domain/ports/employee-repository.port";
import { DEPARTMENT_REPOSITORY } from "./domain/ports/department-repository.port";
import { POSITION_REPOSITORY } from "./domain/ports/position-repository.port";
import { PAYROLL_RUN_REPOSITORY } from "./domain/ports/payroll-run-repository.port";
import { LEAVE_REQUEST_REPOSITORY } from "./domain/ports/leave-request-repository.port";
import { EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY } from "./domain/ports/employee-attendance-shift-repository.port";
import { PAYROLL_ADJUSTMENT_REPOSITORY } from "./domain/ports/payroll-adjustment-repository.port";
import { KyselyEmployeeRepository } from "./infrastructure/persistence/kysely-employee.repository";
import { KyselyDepartmentRepository } from "./infrastructure/persistence/kysely-department.repository";
import { KyselyPositionRepository } from "./infrastructure/persistence/kysely-position.repository";
import { KyselyPayrollRunRepository } from "./infrastructure/persistence/kysely-payroll-run.repository";
import { KyselyLeaveRequestRepository } from "./infrastructure/persistence/kysely-leave-request.repository";
import { KyselyEmployeeAttendanceShiftRepository } from "./infrastructure/persistence/kysely-employee-attendance-shift.repository";
import { KyselyPayrollAdjustmentRepository } from "./infrastructure/persistence/kysely-payroll-adjustment.repository";
import { RegisterEmployeeHandler } from "./application/commands/register-employee.handler";
import { SetEmployeeStatusHandler } from "./application/commands/set-employee-status.handler";
import { RegisterDepartmentHandler } from "./application/commands/register-department.handler";
import { UpdateDepartmentHandler } from "./application/commands/update-department.handler";
import { RegisterPositionHandler } from "./application/commands/register-position.handler";
import { UpdatePositionHandler } from "./application/commands/update-position.handler";
import { RegisterPayrollRunHandler } from "./application/commands/register-payroll-run.handler";
import { ApprovePayrollRunHandler } from "./application/commands/approve-payroll-run.handler";
import { CancelPayrollRunHandler } from "./application/commands/cancel-payroll-run.handler";
import { DeleteDraftPayrollRunHandler } from "./application/commands/delete-draft-payroll-run.handler";
import { RegisterLeaveRequestHandler } from "./application/commands/register-leave-request.handler";
import { CancelLeaveRequestHandler } from "./application/commands/cancel-leave-request.handler";
import { ReviewLeaveRequestHandler } from "./application/commands/review-leave-request.handler";
import { CheckInEmployeeHandler } from "./application/commands/check-in-employee.handler";
import { CheckOutEmployeeHandler } from "./application/commands/check-out-employee.handler";
import { ListEmployeesHandler } from "./application/queries/list-employees.handler";
import { ListDepartmentsHandler } from "./application/queries/list-departments.handler";
import { ListPositionsHandler } from "./application/queries/list-positions.handler";
import { ListPayrollRunsHandler } from "./application/queries/list-payroll-runs.handler";
import { GetOwnEmployeeProfileHandler } from "./application/queries/get-own-employee-profile.handler";
import { ListOwnPayslipsHandler } from "./application/queries/list-own-payslips.handler";
import { ListOwnLeaveRequestsHandler } from "./application/queries/list-own-leave-requests.handler";
import { ListLeaveRequestsHandler } from "./application/queries/list-leave-requests.handler";
import { ListOwnAttendanceShiftsHandler } from "./application/queries/list-own-attendance-shifts.handler";
import { RegisterPayrollAdjustmentHandler } from "./application/commands/register-payroll-adjustment.handler";
import { CancelPayrollAdjustmentHandler } from "./application/commands/cancel-payroll-adjustment.handler";
import { ListPayrollAdjustmentsHandler } from "./application/queries/list-payroll-adjustments.handler";
import { HrPayrollController } from "./api/hr-payroll.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [HrPayrollController],
  providers: [
    { provide: EMPLOYEE_REPOSITORY, useClass: KyselyEmployeeRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: KyselyDepartmentRepository },
    { provide: POSITION_REPOSITORY, useClass: KyselyPositionRepository },
    { provide: PAYROLL_RUN_REPOSITORY, useClass: KyselyPayrollRunRepository },
    { provide: LEAVE_REQUEST_REPOSITORY, useClass: KyselyLeaveRequestRepository },
    { provide: EMPLOYEE_ATTENDANCE_SHIFT_REPOSITORY, useClass: KyselyEmployeeAttendanceShiftRepository },
    { provide: PAYROLL_ADJUSTMENT_REPOSITORY, useClass: KyselyPayrollAdjustmentRepository },
    RegisterEmployeeHandler,
    SetEmployeeStatusHandler,
    RegisterDepartmentHandler,
    UpdateDepartmentHandler,
    RegisterPositionHandler,
    UpdatePositionHandler,
    RegisterPayrollRunHandler,
    ApprovePayrollRunHandler,
    CancelPayrollRunHandler,
    DeleteDraftPayrollRunHandler,
    RegisterLeaveRequestHandler,
    CancelLeaveRequestHandler,
    ReviewLeaveRequestHandler,
    CheckInEmployeeHandler,
    CheckOutEmployeeHandler,
    ListEmployeesHandler,
    ListDepartmentsHandler,
    ListPositionsHandler,
    ListPayrollRunsHandler,
    GetOwnEmployeeProfileHandler,
    ListOwnPayslipsHandler,
    ListOwnLeaveRequestsHandler,
    ListLeaveRequestsHandler,
    ListOwnAttendanceShiftsHandler,
    RegisterPayrollAdjustmentHandler,
    CancelPayrollAdjustmentHandler,
    ListPayrollAdjustmentsHandler,
  ],
  exports: [EMPLOYEE_REPOSITORY, PAYROLL_RUN_REPOSITORY],
})
export class HrPayrollModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "hr",
      groupLabel: "الموارد البشرية والرواتب",
      permissions: [
        { key: "hr.employees.view", label: "رؤية الموظفين" },
        { key: "hr.employees.manage", label: "إدارة الموظفين (إنشاء/تعديل/إنهاء خدمة)" },
        { key: "hr.payroll.view", label: "رؤية قوائم الرواتب" },
        { key: "hr.payroll.manage", label: "إعداد قوائم الرواتب" },
        { key: "hr.payroll.approve", label: "اعتماد/إلغاء قوائم الرواتب" },
        { key: "hr.self.view", label: "بياناتي (بروفايل/قسائم راتب/حضور)" },
        { key: "hr.self.leave.manage", label: "طلبات الإجازة الخاصة بيا" },
        { key: "hr.leave.review", label: "مراجعة طلبات إجازة الموظفين" },
        { key: "hr.payroll.adjustments.manage", label: "تسجيل/إلغاء سلف وجزاءات ومكافآت الموظفين" },
        { key: "hr.organization.manage", label: "إدارة الهيكل التنظيمي (أقسام ومسميات وظيفية)" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["hr.employees.view", "hr.payroll.view", "hr.leave.review"]);
    this.permissions.setRoleDefaults("accountant", [
      "hr.employees.view",
      "hr.payroll.view",
      "hr.payroll.manage",
      "hr.payroll.approve",
      "hr.payroll.adjustments.manage",
      "hr.organization.manage",
    ]);
    // بوابة الخدمة الذاتية متاحة لأي دور - نفس فلسفة "زر بياناتي" اللي كان ظاهر في كل شاشة في الريبو
    // القديم بغض النظر عن دور المستخدم
    for (const role of ROLES) {
      this.permissions.setRoleDefaults(role, ["hr.self.view", "hr.self.leave.manage"]);
    }
  }
}
