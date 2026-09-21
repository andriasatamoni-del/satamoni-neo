import type { Printer, PrinterType } from "../printer.aggregate";

export interface PrinterRepositoryPort {
  save(printer: Printer): Promise<void>;
  findById(id: string): Promise<Printer | null>;
  listByBranch(branchId: string): Promise<Printer[]>;
  // طابعة شغالة من نوع معيّن في الفرع - الافتراضية (isDefaultForType) الأول، وإلا أقدم طابعة شغالة من
  // نفس النوع (created_at ASC - نفس فلسفة "id ASC" في الريبو القديم، بس هنا الـid عشوائي UUID مش تسلسلي)
  resolveForType(branchId: string, printerType: PrinterType): Promise<Printer | null>;
  delete(id: string): Promise<void>;
}

export const PRINTER_REPOSITORY = Symbol("PRINTER_REPOSITORY");
