import { auditDetail } from "../../../../shared/audit/audit-context";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupplierInvoice } from "../../domain/supplier-invoice.aggregate";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";
import { SupplierInvoiceNotFoundError } from "../../domain/errors";
import { RegisterJournalEntryHandler } from "../../../accounting/application/commands/register-journal-entry.handler";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";
import { AccountingPostingService } from "../../../accounting/application/services/accounting-posting.service";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { SegregationOfDutiesError } from "../../../../shared/domain/domain-error";

const VARIANCE_TOLERANCE = 0.0000001;
const INVENTORY_ACCOUNT_CODE = "1400";
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";

export interface ApproveSupplierInvoiceCommand {
  supplierInvoiceId: string;
  approvedBy?: string | null;
}

// بيرحّل قيد الفرق بس (لو موجود) ويحوّل الحالة لـAPPROVED - نفس فلسفة الريبو القديم بالظبط: اعتماد
// فاتورة فيها فرق قرار واعي، مش تلقائي أبدًا (مفيش موافقة تلقائية على فرق)
@Injectable()
export class ApproveSupplierInvoiceHandler {
  private readonly logger = new Logger(ApproveSupplierInvoiceHandler.name);

  constructor(
    @Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly registerJournalEntry: RegisterJournalEntryHandler,
    private readonly posting: AccountingPostingService,
    private readonly tx: TransactionService
  ) {}

  // Phase 3.1: BL-05 - the user who created the invoice may not approve it; one transaction + row lock so the variance journal is
  // posted exactly once even for concurrent/replayed approvals; a missing chart of accounts rejects the approval (strict mode).
  async execute(command: ApproveSupplierInvoiceCommand): Promise<SupplierInvoice> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: ApproveSupplierInvoiceCommand): Promise<SupplierInvoice> {
    if (!(await this.tx.lockRow("supplier_invoices", command.supplierInvoiceId))) throw new SupplierInvoiceNotFoundError();
    const invoice = await this.invoices.findById(command.supplierInvoiceId);
    if (!invoice) throw new SupplierInvoiceNotFoundError();
    if (invoice.createdBy && command.approvedBy && invoice.createdBy === command.approvedBy && invoice.status !== "APPROVED") {
      throw new SegregationOfDutiesError("اعتماد فاتورة المورد");
    }

    auditDetail({ entityType: "supplier_invoices", entityId: invoice.id, before: { status: invoice.status, total: invoice.total, varianceAmount: invoice.varianceAmount } });
    const wasApprovedNow = invoice.approve({ approvedBy: command.approvedBy ?? null });
    if (!wasApprovedNow) return invoice; // idempotent - كانت معتمدة بالفعل

    if (Math.abs(invoice.varianceAmount) > VARIANCE_TOLERANCE) {
      const acc = await this.posting.requireAccounts([INVENTORY_ACCOUNT_CODE, ACCOUNTS_PAYABLE_ACCOUNT_CODE], "supplier_invoice_variance", invoice.id);
      if (acc) {
        const inventoryAccount = acc[INVENTORY_ACCOUNT_CODE];
        const apAccount = acc[ACCOUNTS_PAYABLE_ACCOUNT_CODE];
        const variance = invoice.varianceAmount;
        const lines = variance > 0
          ? [
              { accountId: inventoryAccount.id, debit: variance, credit: 0 },
              { accountId: apAccount.id, debit: 0, credit: variance, referenceType: "supplier", referenceId: invoice.supplierId },
            ]
          : [
              { accountId: apAccount.id, debit: -variance, credit: 0, referenceType: "supplier", referenceId: invoice.supplierId },
              { accountId: inventoryAccount.id, debit: 0, credit: -variance },
            ];
        const entry = await this.registerJournalEntry.execute({
          sourceType: "supplier_invoice_variance",
          sourceId: invoice.id,
          branchId: invoice.branchId,
          description: `فرق فاتورة مورد #${invoice.supplierInvoiceNumber}`,
          lines,
          createdBy: command.approvedBy,
        });
        invoice.assignVarianceJournalEntry(entry.id);
      }
    }

    await this.invoices.save(invoice);

    auditDetail({ after: { status: invoice.status } });
    return invoice;
  }
}
