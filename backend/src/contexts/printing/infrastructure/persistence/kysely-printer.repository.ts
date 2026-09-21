import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Printer, type PrinterType, type ConnectionType } from "../../domain/printer.aggregate";
import type { PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import type { PrintersTable } from "./printing.schema";

@Injectable()
export class KyselyPrinterRepository implements PrinterRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

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
      .insertInto("printers")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
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
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Printer | null> {
    const row = await this.db.selectFrom("printers").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async listByBranch(branchId: string): Promise<Printer[]> {
    const rows = await this.db
      .selectFrom("printers")
      .selectAll()
      .where("branch_id", "=", branchId)
      .orderBy("printer_type")
      .orderBy("name")
      .execute();
    return rows.map((r) => this.toDomain(r));
  }

  async resolveForType(branchId: string, printerType: PrinterType): Promise<Printer | null> {
    const row = await this.db
      .selectFrom("printers")
      .selectAll()
      .where("branch_id", "=", branchId)
      .where("printer_type", "=", printerType)
      .where("is_enabled", "=", true)
      .orderBy("is_default_for_type", "desc")
      .orderBy("created_at", "asc")
      .limit(1)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("printers").where("id", "=", id).execute();
  }

  private toDomain(row: Selectable<PrintersTable>): Printer {
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
