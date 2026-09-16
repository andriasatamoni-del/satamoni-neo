import { Inject, Injectable } from "@nestjs/common";
import { ReconciliationRecord } from "../../domain/reconciliation-record.aggregate";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import { ReconciliationRecordNotFoundError, PaymentNotFoundError } from "../../domain/errors";

export interface MatchReconciliationRecordCommand {
  recordId: string;
  paymentId: string;
}

// مطابقة يدوية صريحة (تبويب "مطابقة طلبات"/إنستاباي/أورانج كاش/فيزا في الريبو القديم) - قرار بشري،
// مايتحققش من مبلغ/تاريخ زي المطابقة التلقائية (راجع AutoMatchReconciliationRecordsHandler)
@Injectable()
export class MatchReconciliationRecordHandler {
  constructor(
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort
  ) {}

  async execute(command: MatchReconciliationRecordCommand): Promise<ReconciliationRecord> {
    const record = await this.records.findById(command.recordId);
    if (!record) throw new ReconciliationRecordNotFoundError();
    const payment = await this.payments.findById(command.paymentId);
    if (!payment) throw new PaymentNotFoundError();

    record.match(payment.id);
    await this.records.save(record);
    return record;
  }
}
