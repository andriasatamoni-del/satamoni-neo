import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { EMPLOYEE_REPOSITORY } from "./domain/ports/employee-repository.port";
import { PAYROLL_RUN_REPOSITORY } from "./domain/ports/payroll-run-repository.port";
import { KyselyEmployeeRepository } from "./infrastructure/persistence/kysely-employee.repository";
import { KyselyPayrollRunRepository } from "./infrastructure/persistence/kysely-payroll-run.repository";
import { RegisterEmployeeHandler } from "./application/commands/register-employee.handler";
import { SetEmployeeStatusHandler } from "./application/commands/set-employee-status.handler";
import { RegisterPayrollRunHandler } from "./application/commands/register-payroll-run.handler";
import { ApprovePayrollRunHandler } from "./application/commands/approve-payroll-run.handler";
import { CancelPayrollRunHandler } from "./application/commands/cancel-payroll-run.handler";
import { DeleteDraftPayrollRunHandler } from "./application/commands/delete-draft-payroll-run.handler";
import { ListEmployeesHandler } from "./application/queries/list-employees.handler";
import { ListPayrollRunsHandler } from "./application/queries/list-payroll-runs.handler";
import { HrPayrollController } from "./api/hr-payroll.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [HrPayrollController],
  providers: [
    { provide: EMPLOYEE_REPOSITORY, useClass: KyselyEmployeeRepository },
    { provide: PAYROLL_RUN_REPOSITORY, useClass: KyselyPayrollRunRepository },
    RegisterEmployeeHandler,
    SetEmployeeStatusHandler,
    RegisterPayrollRunHandler,
    ApprovePayrollRunHandler,
    CancelPayrollRunHandler,
    DeleteDraftPayrollRunHandler,
    ListEmployeesHandler,
    ListPayrollRunsHandler,
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
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["hr.employees.view", "hr.payroll.view"]);
    this.permissions.setRoleDefaults("accountant", [
      "hr.employees.view",
      "hr.payroll.view",
      "hr.payroll.manage",
      "hr.payroll.approve",
    ]);
  }
}
