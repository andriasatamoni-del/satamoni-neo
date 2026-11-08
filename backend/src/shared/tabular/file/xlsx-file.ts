import ExcelJS from "exceljs";
import { TabularFileError, TabularTooManyRowsError } from "../tabular-errors";
import { isBlankCell, UnreadableCell, type RawCell, type RawRow, type RawSheet, type ReadLimits, type SheetToWrite } from "./spreadsheet-content";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const CENTRAL_DIRECTORY_ENTRY_SIZE = 46;
const MAX_ZIP_COMMENT = 0xffff;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;

export async function readXlsx(content: Buffer, limits: ReadLimits): Promise<RawSheet> {
  assertUncompressedSizeWithin(content, limits.maxUncompressedBytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(content as unknown as ArrayBuffer);
  } catch {
    throw damagedWorkbook();
  }
  const worksheet = workbook.getWorksheet(limits.preferredSheetName) ?? workbook.worksheets[0];
  if (!worksheet) return { rows: [], decimalComma: false };

  const rows: RawRow[] = [];
  let columnCount = 0;
  worksheet.eachRow({ includeEmpty: false }, (row, line) => {
    if (columnCount === 0) columnCount = lastFilledPosition(row);
    if (columnCount === 0) return;
    const cells: RawCell[] = [];
    for (let position = 1; position <= columnCount; position++) cells.push(toRawCell(row.getCell(position).value));
    if (cells.every(isBlankCell)) return;
    if (rows.length > limits.maxDataRows) throw new TabularTooManyRowsError(limits.maxDataRows);
    rows.push({ line, cells });
  });
  return { rows, decimalComma: false };
}

export async function writeXlsx(sheet: SheetToWrite): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheet.sheetName, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  worksheet.columns = sheet.columns.map((col) => ({
    header: col.header,
    width: col.width,
    style: col.excelNumberFormat ? { numFmt: col.excelNumberFormat } : {},
  }));
  worksheet.getRow(1).font = { bold: true };
  for (const row of sheet.rows) worksheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function lastFilledPosition(row: ExcelJS.Row): number {
  let last = 0;
  row.eachCell({ includeEmpty: false }, (cell, position) => {
    if (!isBlankCell(toRawCell(cell.value))) last = Math.max(last, position);
  });
  return last;
}

function toRawCell(value: ExcelJS.CellValue | undefined): RawCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("error" in value) return new UnreadableCell(String(value.error));
  if ("formula" in value || "sharedFormula" in value) {
    return value.result === undefined || value.result === null ? new UnreadableCell("صيغة من غير قيمة محسوبة") : toRawCell(value.result);
  }
  if ("text" in value) return typeof value.text === "string" ? value.text : null;
  return null;
}

function damagedWorkbook(): TabularFileError {
  return new TabularFileError("ملف الإكسيل تالف أو مش بصيغة xlsx");
}

function assertUncompressedSizeWithin(content: Buffer, maxUncompressedBytes: number): void {
  const searchFrom = Math.max(0, content.length - END_OF_CENTRAL_DIRECTORY_SIZE - MAX_ZIP_COMMENT);
  let end = -1;
  for (let offset = content.length - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= searchFrom; offset--) {
    if (content.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw damagedWorkbook();

  const entries = content.readUInt16LE(end + 10);
  const directoryOffset = content.readUInt32LE(end + 16);
  if (entries === ZIP64_MARKER_16 || directoryOffset === ZIP64_MARKER_32) throw damagedWorkbook();

  let offset = directoryOffset;
  let total = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + CENTRAL_DIRECTORY_ENTRY_SIZE > content.length || content.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) throw damagedWorkbook();
    const uncompressed = content.readUInt32LE(offset + 24);
    if (uncompressed === ZIP64_MARKER_32) throw damagedWorkbook();
    total += uncompressed;
    if (total > maxUncompressedBytes) {
      throw new TabularFileError("محتوى ملف الإكسيل كبير جدًا بعد فك الضغط - قسّمه على كذا ملف أو احذف الشيتات الزيادة");
    }
    offset += CENTRAL_DIRECTORY_ENTRY_SIZE + content.readUInt16LE(offset + 28) + content.readUInt16LE(offset + 30) + content.readUInt16LE(offset + 32);
  }
}
