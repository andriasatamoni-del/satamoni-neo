import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Printer, type PrinterType, type ConnectionType } from "../../domain/printer.aggregate";
import type { PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import { printers } from "./printing.tables";

@Injectable()
export class PrinterRepository implements PrinterRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(printer: Printer): Promise<void> {
    const row = {
      id: printer.id,
      branch_id: printer.branchId,
      name: printer.name,
      printer_type: printer.printerType,
      connection_type: printer.connectionType,
      os_printer_name: printer.osPrinterName,
      ip_address: printer.ipAddress,
      port: printer.port,
      paper_width_mm: printer.paperWidthMm,
      is_enabled: printer.isEnabled,
      is_default_for_type: printer.isDefaultForType,
      created_at: printer.createdAt,
      updated_at: printer.updatedAt,
    };
    await this.db
      .insert(printers)
      .values(row)
      .onConflictDoUpdate({
        target: printers.id,
        set: {
          name: row.name,
          printer_type: row.printer_type,
          connection_type: row.connection_type,
          os_printer_name: row.os_printer_name,
          ip_address: row.ip_address,
          port: row.port,
          paper_width_mm: row.paper_width_mm,
          is_enabled: row.is_enabled,
          is_default_for_type: row.is_default_for_type,
          updated_at: row.updated_at,
        },
      });
  }

  async findById(id: string): Promise<Printer | null> {
    const [row] = await this.db.select().from(printers).where(eq(printers.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listByBranch(branchId: string): Promise<Printer[]> {
    const rows = await this.db
      .select()
      .from(printers)
      .where(eq(printers.branch_id, branchId))
      .orderBy(asc(printers.printer_type), asc(printers.name));
    return rows.map((r) => this.toDomain(r));
  }

  async resolveForType(branchId: string, printerType: PrinterType): Promise<Printer | null> {
    const [row] = await this.db
      .select()
      .from(printers)
      .where(and(eq(printers.branch_id, branchId), eq(printers.printer_type, printerType), eq(printers.is_enabled, true)))
      .orderBy(desc(printers.is_default_for_type), asc(printers.created_at))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(printers).where(eq(printers.id, id));
  }

  private toDomain(row: typeof printers.$inferSelect): Printer {
    return Printer.reconstitute(row.id, {
      branchId: row.branch_id,
      name: row.name,
      printerType: row.printer_type as PrinterType,
      connectionType: row.connection_type as ConnectionType,
      osPrinterName: row.os_printer_name,
      ipAddress: row.ip_address,
      port: row.port,
      paperWidthMm: row.paper_width_mm,
      isEnabled: row.is_enabled,
      isDefaultForType: row.is_default_for_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
