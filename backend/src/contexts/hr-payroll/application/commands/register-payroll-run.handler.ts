import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";
import { DuplicatePayrollPeriodError, EmployeeNotFoundError, PayrollAdjustmentMismatchError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";

export interface RegisterPayrollRunCommand {
  year: number;
  month: number;
  employees: { employeeId: string; branchId?: string | null; grossPay: number; advances?: number; penalties?: number; bonuses?: number }[];
  createdBy?: string | null;
  /** explicit confirmation that manually typed advances/penalties/bonuses may differ from the registered adjustments */
  acknowledgeAdjustmentMismatch?: boolean;
}

const FIELD_OF_TYPE = { advance: "advances", penalty: "penalties", bonus: "bonuses" } as const;

// Phase 3.1 (BL-04 / BL-10):
//  * one transaction + a per-period advisory lock: two concurrent registrations for the same month can not both pass the
//    "no active run" check;
//  * registered payroll adjustments (advance / penalty / bonus) of the month that no run has consumed yet are applied to the line of
//    their employee and LINKED to the run (payroll_adjustments.payroll_run_id) - they are never silently omitted nor applied twice.
//    Omitted line values default to the adjustments' totals; explicitly typed values that differ from them are rejected (409) unless
//    the caller acknowledges the mismatch (the discrepancy is then recorded in the audit trail). With NO eligible adjustments the
//    typed values are accepted exactly as before (backwards compatible).
@Injectable()
export class RegisterPayrollRunHandler {
  constructor(
    @Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort,
    @Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: RegisterPayrollRunCommand): Promise<PayrollRun> {
    return this.tx.run(async () => {
      await this.tx.advisoryLock(`payroll-run:${command.year}-${command.month}`);
      if (await this.payrollRuns.findActiveByPeriod(command.year, command.month)) {
        throw new DuplicatePayrollPeriodError(command.year, command.month);
      }

      const employeeIds = [...new Set(command.employees.map((e) => e.employeeId))];
      const eligible = await this.adjustments.listUnlinkedActiveForMonth(command.year, command.month, employeeIds);

      const lines = [];
      const consumed: string[] = [];
      const mismatches: Array<Record<string, unknown>> = [];
      for (const line of command.employees) {
        const employee = await this.employees.findById(line.employeeId);
        if (!employee) throw new EmployeeNotFoundError();

        const mine = eligible.filter((a) => a.employeeId === line.employeeId);
        const totals = { advances: 0, penalties: 0, bonuses: 0 };
        for (const a of mine) totals[FIELD_OF_TYPE[a.adjustmentType]] += a.amount;

        const resolved = { advances: line.advances, penalties: line.penalties, bonuses: line.bonuses };
        for (const field of ["advances", "penalties", "bonuses"] as const) {
          if (resolved[field] === undefined) {
            resolved[field] = totals[field];
          } else if (mine.length > 0 && Math.abs(resolved[field]! - totals[field]) > 0.005) {
            if (!command.acknowledgeAdjustmentMismatch) {
              throw new PayrollAdjustmentMismatchError(employee.name, `${field}: المُدخل ${resolved[field]} ≠ المسجّل ${totals[field]}`);
            }
            mismatches.push({ employeeId: line.employeeId, field, entered: resolved[field], registered: totals[field] });
          }
        }
        consumed.push(...mine.map((a) => a.id));
        lines.push({ ...line, ...resolved, employeeName: employee.name });
      }

      const run = PayrollRun.register({ year: command.year, month: command.month, employees: lines, createdBy: command.createdBy });
      await this.payrollRuns.save(run);
      await this.adjustments.linkToRun(consumed, run.id);
      auditDetail({ after: { payrollRunId: run.id, linkedAdjustments: consumed.length, acknowledgedMismatches: mismatches } });
      return run;
    });
  }
}
