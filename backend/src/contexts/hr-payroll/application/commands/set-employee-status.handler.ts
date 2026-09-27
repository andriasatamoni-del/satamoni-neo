import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeNotFoundError, TerminationBlockersError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../../identity-access/domain/ports/user-repository.port";
import { TerminationBlockersService } from "../services/termination-blockers.service";
import { EmployeeHistoryService } from "../services/employee-history.service";

export interface SetEmployeeStatusCommand {
  employeeId: string;
  status: string;
  terminationDate?: Date | null;
  terminationReason?: string | null;
  changedBy?: string | null;
  reason?: string | null;
  acknowledgeBlockers?: boolean;
}

export interface TerminationCascade {
  userDisabled: boolean;
}

// قبل كده كان مجرد تحديث عمود عادي - مفيش أي أثر تاني خالص (حساب الدخول المرتبط فاضل شغال، مفيش تحقق من
// أي حاجة معلّقة قبل ما "الإنهاء" يتسجل). نفس إصلاح db/employee-termination.js بالريبو القديم بالظبط:
// (1) لو الحالة الجديدة "terminated" وفيه بنود معلّقة، بيرفض الطلب ويعرضها صراحة - إلا لو acknowledgeBlockers
// اتبعتت (2) تعطيل حساب الدخول المرتبط فورًا (JwtAuthGuard بيقرأ isActive فريش من القاعدة في كل طلب،
// فمفيش داعي لأي آلية إبطال توكن منفصلة). كل تغيير في status/department/position/restrictedBranchId
// بيتسجّل في employee_history
@Injectable()
export class SetEmployeeStatusHandler {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly terminationBlockers: TerminationBlockersService,
    private readonly employeeHistory: EmployeeHistoryService
  ) {}

  async execute(command: SetEmployeeStatusCommand): Promise<{ employee: Employee; terminationCascade: TerminationCascade | null }> {
    const employee = await this.employees.findById(command.employeeId);
    if (!employee) throw new EmployeeNotFoundError();

    const before = {
      department_id: employee.departmentId,
      position_id: employee.positionId,
      restricted_branch_id: employee.restrictedBranchId,
      status: employee.status,
    };

    const isTerminating = command.status === "terminated" && employee.status !== "terminated";
    let terminationCascade: TerminationCascade | null = null;

    if (isTerminating) {
      const blockers = await this.terminationBlockers.check({ employeeId: employee.id, userId: employee.userId });
      if (blockers.length > 0 && command.acknowledgeBlockers !== true) {
        throw new TerminationBlockersError(blockers);
      }

      employee.terminate({ date: command.terminationDate ?? new Date(), reason: command.terminationReason });

      let userDisabled = false;
      if (employee.userId) {
        const user = await this.users.findById(employee.userId);
        if (user) {
          user.deactivate();
          await this.users.save(user);
          userDisabled = true;
        }
      }
      terminationCascade = { userDisabled };
    } else {
      employee.setStatus(command.status);
    }

    await this.employees.save(employee);
    await this.employeeHistory.recordChanges({
      employeeId: employee.id,
      before,
      changes: { status: employee.status },
      changedBy: command.changedBy ?? null,
      reason: command.reason ?? null,
    });

    return { employee, terminationCascade };
  }
}
