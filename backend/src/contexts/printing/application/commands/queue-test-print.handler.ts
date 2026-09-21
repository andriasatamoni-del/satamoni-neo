import { Inject, Injectable } from "@nestjs/common";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import { PrintJob } from "../../domain/print-job.aggregate";
import { PrinterNotFoundError, PrinterDisabledError } from "../../domain/errors";
import { buildTestPrint } from "../../infrastructure/print-templates";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../../branches/domain/ports/branch-repository.port";

export interface QueueTestPrintCommand {
  printerId: string;
  createdBy?: string | null;
}

// طباعة تجريبية من شاشة إدارة الطابعات - مش مرتبطة بطلب حقيقي، ومسموح تتكرر بحرية (كل ضغطة زر لها
// idempotency_key فريد بالوقت - عكس باقي الأنواع عمدًا، لأن هنا التكرار مطلوب مش عيب)
@Injectable()
export class QueueTestPrintHandler {
  constructor(
    @Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort,
    @Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort
  ) {}

  async execute(command: QueueTestPrintCommand): Promise<PrintJob> {
    const printer = await this.printers.findById(command.printerId);
    if (!printer) throw new PrinterNotFoundError();
    if (!printer.isEnabled) throw new PrinterDisabledError();

    const branch = await this.branches.findById(printer.branchId);
    const job = PrintJob.queue({
      branchId: printer.branchId,
      printType: "TEST_PRINT",
      printerId: printer.id,
      contentHtml: buildTestPrint({ printerName: printer.name, branchLabel: branch?.name ?? "" }),
      idempotencyKey: `printer:${printer.id}:test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      createdBy: command.createdBy,
    });
    return this.printJobs.queue(job);
  }
}
