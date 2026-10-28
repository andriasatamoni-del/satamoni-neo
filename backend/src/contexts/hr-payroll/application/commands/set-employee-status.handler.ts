import { Inject, Injectable } from "@nestjs/common";
import { Employee } from "../../domain/employee.aggregate";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeNotFoundError, TerminationBlockersError } from "../../domain/errors";
import { ActiveAdminGuard } from "../../../identity-access/application/services/active-admin-guard.service";
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

@Injectable()
export class SetEmployeeStatusHandler {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort,
    private readonly activeAdminGuard: ActiveAdminGuard,
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

      const disabledUser = employee.userId ? await this.activeAdminGuard.updateUser(employee.userId, (u) => u.deactivate()) : null;
      terminationCascade = { userDisabled: disabledUser !== null };
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
