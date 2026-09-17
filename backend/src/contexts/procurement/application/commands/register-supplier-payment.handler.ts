import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupplierPayment } from "../../domain/supplier-payment.aggregate";
import {
  SUPPLIER_PAYMENT_REPOSITORY,
  type SupplierPaymentRepositoryPort,
} from "../../domain/ports/supplier-payment-repository.port";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";
import { SUPPLIER_REPOSITORY, type SupplierRepositoryPort } from "../../domain/ports/supplier-repository.port";
import {
  SupplierInvoiceNotFoundError,
  SupplierNotFoundError,
  SupplierPaymentExceedsOutstandingError,
  SupplierPaymentInvoiceMismatchError,
  SupplierInvoiceNotPayableError,
} from "../../domain/errors";
import { RegisterJournalEntryHandler } from "../../../accounting/application/commands/register-journal-entry.handler";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";
import { TREASURY_REPOSITORY, type TreasuryRepositoryPort } from "../../../treasury/domain/ports/treasury-repository.port";
import { TreasuryNotFoundError } from "../../../treasury/domain/errors";

const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";
const PAYABLE_INVOICE_STATUSES = ["APPROVED", "PARTIALLY_PAID"];
const INVOICE_TOLERANCE = 0.01;

export interface RegisterSupplierPaymentCommand {
  supplierId: string;
  branchId: string;
  amount: number;
  supplierInvoiceId?: string | null;
  treasuryId: string;
  paymentDate?: Date;
  referenceNumber?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class RegisterSupplierPaymentHandler {
  private readonly logger = new Logger(RegisterSupplierPaymentHandler.name);

  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepositoryPort,
    @Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepositoryPort,
    @Inject(TREASURY_REPOSITORY) private readonly treasuries: TreasuryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly registerJournalEntry: RegisterJournalEntryHandler
  ) {}

  async execute(command: RegisterSupplierPaymentCommand): Promise<SupplierPayment> {
    if (!(await this.suppliers.findById(command.supplierId))) throw new SupplierNotFoundError();
    const treasury = await this.treasuries.findById(command.treasuryId);
    if (!treasury) throw new TreasuryNotFoundError();

    let invoice = null;
    if (command.supplierInvoiceId) {
      invoice = await this.invoices.findById(command.supplierInvoiceId);
      if (!invoice) throw new SupplierInvoiceNotFoundError();
      if (invoice.supplierId !== command.supplierId || invoice.branchId !== command.branchId) {
        throw new SupplierPaymentInvoiceMismatchError();
      }
      if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) throw new SupplierInvoiceNotPayableError();

      const alreadyPaid = await this.payments.sumByInvoiceId(invoice.id);
      if (alreadyPaid + command.amount > invoice.total + INVOICE_TOLERANCE) {
        throw new SupplierPaymentExceedsOutstandingError(invoice.total - alreadyPaid);
      }
    }

    const payment = SupplierPayment.register(command);
    await this.payments.save(payment);

    const apAccount = await this.accounts.findByCode(ACCOUNTS_PAYABLE_ACCOUNT_CODE);
    if (!apAccount) {
      this.logger.warn(`تخطّي ترحيل قيد سداد المورد ${payment.id} - دليل الحسابات لسه مش معدّ (${ACCOUNTS_PAYABLE_ACCOUNT_CODE})`);
    } else {
      const entry = await this.registerJournalEntry.execute({
        sourceType: "supplier_payment",
        sourceId: payment.id,
        branchId: command.branchId,
        description: `سداد مورد`,
        lines: [
          { accountId: apAccount.id, debit: command.amount, credit: 0, referenceType: "supplier", referenceId: command.supplierId },
          { accountId: treasury.accountId, debit: 0, credit: command.amount },
        ],
        createdBy: command.createdBy,
      });
      payment.assignJournalEntry(entry.id);
      await this.payments.save(payment);
    }

    if (invoice) {
      const totalPaid = await this.payments.sumByInvoiceId(invoice.id);
      invoice.applyPaymentStatus(totalPaid >= invoice.total - INVOICE_TOLERANCE ? "PAID" : "PARTIALLY_PAID");
      await this.invoices.save(invoice);
    }

    return payment;
  }
}
