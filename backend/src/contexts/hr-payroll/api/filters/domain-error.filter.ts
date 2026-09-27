import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import {
  EmployeeNotFoundError,
  PayrollRunNotFoundError,
  EmployeeProfileNotLinkedError,
  LeaveRequestNotFoundError,
  EmployeeAttendanceShiftNotFoundError,
  PayrollAdjustmentNotFoundError,
  DepartmentNotFoundError,
  PositionNotFoundError,
  DuplicateDepartmentCodeError,
  DuplicateDepartmentNameError,
  DuplicatePositionCodeError,
  BranchTransferRequiresAdminError,
  TerminationBlockersError,
} from "../../domain/errors";

@Catch(DomainError)
export class HrPayrollDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof TerminationBlockersError) {
      res.status(409).json({ error: exception.message, blockers: exception.blockers });
      return;
    }
    if (exception instanceof BranchTransferRequiresAdminError) {
      res.status(403).json({ error: exception.message });
      return;
    }

    const isNotFound =
      exception instanceof EmployeeNotFoundError ||
      exception instanceof PayrollRunNotFoundError ||
      exception instanceof EmployeeProfileNotLinkedError ||
      exception instanceof LeaveRequestNotFoundError ||
      exception instanceof EmployeeAttendanceShiftNotFoundError ||
      exception instanceof PayrollAdjustmentNotFoundError ||
      exception instanceof DepartmentNotFoundError ||
      exception instanceof PositionNotFoundError;
    const isConflict =
      exception instanceof DuplicateDepartmentCodeError ||
      exception instanceof DuplicateDepartmentNameError ||
      exception instanceof DuplicatePositionCodeError;
    res.status(isNotFound ? 404 : isConflict ? 409 : 400).json({ error: exception.message });
  }
}
