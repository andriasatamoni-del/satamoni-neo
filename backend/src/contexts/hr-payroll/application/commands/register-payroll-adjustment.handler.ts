import { Inject, Injectable } from "@nestjs/common";
import { PayrollAdjustment } from "../../domain/payroll-adjustment.aggregate";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { EmployeeNotFoundError } from "../../domain/errors";

export interface RegisterPayrollAdjustmentCommand {
  employeeId: string;
  entryDate: Date;
  adjustmentType: string;
  amount: number;
  notes?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class RegisterPayrollAdjustmentHandler {
  constructor(
    @Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(command: RegisterPayrollAdjustmentCommand): Promise<PayrollAdjustment> {
    if (!(await this.employees.findById(command.employeeId))) throw new EmployeeNotFoundError();

    const adjustment = PayrollAdjustment.register(command);
    await this.adjustments.save(adjustment);
    return adjustment;
  }
}
