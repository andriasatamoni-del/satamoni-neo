import { Injectable } from "@nestjs/common";
import { DomainError } from "../domain/domain-error";
import { pgError, TransactionService } from "../database/transaction-context";
import { auditDetail } from "../audit/audit-context";
import { businessDateString } from "../time/business-date";
import { readSpreadsheet, writeSpreadsheet } from "./file/spreadsheet-file";
import { SPREADSHEET_CONTENT_TYPES, type SpreadsheetFormat } from "./file/spreadsheet-format";
import type { SheetDefinition, SheetRow } from "./sheet/sheet-definition";
import { readSheetRows, writeSheetRows, type ReadRow, type SheetReadResult } from "./sheet/sheet-rows";
import type { TabularAdapter, TabularContext, TabularRowResult } from "./tabular-adapter";
import { TabularFileError, TabularImportRejectedError, type TabularImportReport, type TabularIssue } from "./tabular-errors";

export const MAX_TABULAR_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TABULAR_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
export const MAX_TABULAR_ROWS = 5000;
const MAX_REPORTED_ISSUES = 500;
const MAX_AUDITED_IDS = 1000;
const FORBIDDEN = 403;

export interface UploadedTabularFile {
  buffer: Buffer;
}

export interface TabularFile {
  fileName: string;
  contentType: string;
  content: Buffer;
}

interface ImportOptions {
  dryRun: boolean;
  context: TabularContext;
}

type RowCounts = Record<TabularRowResult, number>;

interface ImportRun {
  counts: RowCounts;
  ids: string[];
  checkedRows: number;
  failure: TabularIssue | null;
}

class DiscardImport extends Error {}

@Injectable()
export class TabularService {
  constructor(private readonly tx: TransactionService) {}

  async export<S extends SheetDefinition>(sheet: S, rows: readonly SheetRow<S>[], format: SpreadsheetFormat): Promise<TabularFile> {
    return this.toFile(sheet, rows, format, `${sheet.name}-${businessDateString()}`);
  }

  async template<S extends SheetDefinition>(sheet: S, format: SpreadsheetFormat): Promise<TabularFile> {
    return this.toFile(sheet, [], format, `${sheet.name}-template`);
  }

  async readFile<S extends SheetDefinition>(sheet: S, file: UploadedTabularFile | undefined): Promise<SheetReadResult<SheetRow<S>>> {
    const raw = await readSpreadsheet(uploadedContent(file), {
      maxDataRows: MAX_TABULAR_ROWS,
      maxUncompressedBytes: MAX_TABULAR_UNCOMPRESSED_BYTES,
      preferredSheetName: sheet.sheetName,
    });
    return readSheetRows(sheet, raw);
  }

  async import<S extends SheetDefinition, P>(
    adapter: TabularAdapter<S, any, P>,
    file: UploadedTabularFile | undefined,
    options: ImportOptions
  ): Promise<TabularImportReport> {
    const read = await this.readFile(adapter.sheet, file);
    if (read.issues.length > 0) {
      throw new TabularImportRejectedError(
        buildReport({ dryRun: options.dryRun, committed: false, totalRows: read.totalRows, checkedRows: 0, counts: emptyCounts(), issues: read.issues })
      );
    }

    const run = await this.runImport(adapter, read.rows, options);
    const report = buildReport({
      dryRun: options.dryRun,
      committed: run.failure === null && !options.dryRun,
      totalRows: read.totalRows,
      checkedRows: run.checkedRows,
      counts: run.counts,
      issues: run.failure ? [run.failure] : [],
    });
    if (run.failure) throw new TabularImportRejectedError(report);

    auditDetail({
      entityType: adapter.sheet.name,
      branchId: options.context.branchId,
      tabularImport: { dryRun: report.dryRun, totalRows: report.totalRows, ...run.counts, ids: run.ids },
    });
    return report;
  }

  private async runImport<S extends SheetDefinition, P>(
    adapter: TabularAdapter<S, any, P>,
    rows: ReadRow<SheetRow<S>>[],
    { dryRun, context }: ImportOptions
  ): Promise<ImportRun> {
    let run = emptyRun();
    try {
      await this.tx.isolated(async () => {
        run = emptyRun();
        const prepared = adapter.prepare ? await adapter.prepare(rows.map((row) => row.values), context) : (undefined as P);
        for (const row of rows) {
          run.checkedRows++;
          try {
            const outcome = await adapter.importRow(row.values, { ...context, prepared, line: row.line });
            run.counts[outcome.result]++;
            if (outcome.id && run.ids.length < MAX_AUDITED_IDS) run.ids.push(outcome.id);
          } catch (err) {
            const message = rowFailureMessage(err);
            if (message === null) throw err;
            run.failure = { row: row.line, message };
            throw new DiscardImport();
          }
        }
        if (dryRun) throw new DiscardImport();
      });
    } catch (err) {
      if (!(err instanceof DiscardImport)) throw err;
    }
    return run;
  }

  private async toFile<S extends SheetDefinition>(sheet: S, rows: readonly SheetRow<S>[], format: SpreadsheetFormat, baseName: string): Promise<TabularFile> {
    return {
      fileName: `${baseName}.${format}`,
      contentType: SPREADSHEET_CONTENT_TYPES[format],
      content: await writeSpreadsheet(writeSheetRows(sheet, rows), format),
    };
  }
}

function uploadedContent(file: UploadedTabularFile | undefined): Buffer {
  const content = file?.buffer;
  if (!content || content.length === 0) throw new TabularFileError("ارفع ملف إكسيل (xlsx) أو CSV");
  if (content.length > MAX_TABULAR_FILE_BYTES) {
    throw new TabularFileError(`حجم الملف أكبر من ${MAX_TABULAR_FILE_BYTES / 1024 / 1024} ميجا - قسّمه على كذا ملف`);
  }
  return content;
}

function emptyCounts(): RowCounts {
  return { created: 0, updated: 0, unchanged: 0 };
}

function emptyRun(): ImportRun {
  return { counts: emptyCounts(), ids: [], checkedRows: 0, failure: null };
}

function buildReport(fields: Omit<TabularImportReport, "created" | "updated" | "unchanged" | "issueCount"> & { counts: RowCounts }): TabularImportReport {
  const { counts, issues, ...rest } = fields;
  return { ...rest, ...counts, issueCount: issues.length, issues: issues.slice(0, MAX_REPORTED_ISSUES) };
}

function rowFailureMessage(err: unknown): string | null {
  if (err instanceof DomainError) return err.httpStatus === FORBIDDEN || (err.httpStatus ?? 400) >= 500 ? null : err.message;
  const pg = pgError(err);
  switch (pg?.code) {
    case "23505":
      return "القيمة دي موجودة قبل كده (مكررة)";
    case "23503":
      return "مرجع غير موجود";
    case "23502":
    case "23514":
      return "بيانات ناقصة أو مخالفة لقواعد النظام";
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
    case "22001":
      return "قيمة غير صالحة (رقم أو تاريخ أو نص بصيغة غلط)";
    case "P0001":
      return pg.message ?? "السطر ده مخالف لقاعدة عمل";
    default:
      return null;
  }
}
