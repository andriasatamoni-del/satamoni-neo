import { Inject, Injectable } from "@nestjs/common";
import { PrintJob, type PrintType } from "../../domain/print-job.aggregate";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import type { PrinterType } from "../../domain/printer.aggregate";
import type { KitchenStation } from "../../domain/kitchen-station.aggregate";

const NO_STATION_ERROR = "الأصناف دي مش مربوطة بأي محطة تحضير - اربط الصنف/القسم بمحطة من إعدادات الطباعة";

// نقطة مشتركة لإنشاء صف print_jobs - بتحل الطابعة (بالنوع أو من محطة معيّنة) وتنشئ الصف بحالة PENDING/FAILED
// حسب لقيت طابعة ولا لأ (نفس فلسفة insertPrintJob في الريبو القديم بالظبط)
@Injectable()
export class PrintJobQueuer {
  constructor(
    @Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort,
    @Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort
  ) {}

  async queueForType(input: {
    orderId?: string | null;
    branchId: string;
    printType: PrintType;
    printerType: PrinterType;
    contentHtml: string;
    idempotencyKey: string;
    createdBy?: string | null;
  }): Promise<PrintJob> {
    const printer = await this.printers.resolveForType(input.branchId, input.printerType);
    const job = PrintJob.queue({
      orderId: input.orderId,
      branchId: input.branchId,
      printType: input.printType,
      printerId: printer?.id,
      contentHtml: input.contentHtml,
      idempotencyKey: input.idempotencyKey,
      createdBy: input.createdBy,
    });
    return this.printJobs.queue(job);
  }

  async queueForStation(input: {
    orderId: string;
    branchId: string;
    station: KitchenStation | null;
    contentHtml: string;
    idempotencyKey: string;
    createdBy?: string | null;
  }): Promise<PrintJob> {
    const job = PrintJob.queue({
      orderId: input.orderId,
      branchId: input.branchId,
      printType: "KITCHEN_TICKET",
      printerId: input.station?.printerId ?? null,
      stationId: input.station?.id ?? null,
      contentHtml: input.contentHtml,
      idempotencyKey: input.idempotencyKey,
      createdBy: input.createdBy,
      errorReason: input.station ? undefined : NO_STATION_ERROR,
    });
    return this.printJobs.queue(job);
  }
}
