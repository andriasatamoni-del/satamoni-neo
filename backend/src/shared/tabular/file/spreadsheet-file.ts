import { TabularTooManyRowsError } from "../tabular-errors";
import { readCsv, writeCsv } from "./csv-file";
import { isBlankCell, type RawSheet, type ReadLimits, type SheetToWrite } from "./spreadsheet-content";
import { detectSpreadsheetFormat, type SpreadsheetFormat } from "./spreadsheet-format";
import { readXlsx, writeXlsx } from "./xlsx-file";

export async function readSpreadsheet(content: Buffer, limits: ReadLimits): Promise<RawSheet> {
  const format = detectSpreadsheetFormat(content);
  const sheet = format === "xlsx" ? await readXlsx(content, limits) : readCsv(content);
  const filledRows = sheet.rows.filter((row) => !row.cells.every(isBlankCell));
  const dataRows = filledRows.length - 1;
  if (dataRows > limits.maxDataRows) throw new TabularTooManyRowsError(limits.maxDataRows);
  return { rows: filledRows, decimalComma: sheet.decimalComma };
}

export async function writeSpreadsheet(sheet: SheetToWrite, format: SpreadsheetFormat): Promise<Buffer> {
  return format === "xlsx" ? writeXlsx(sheet) : writeCsv(sheet);
}
