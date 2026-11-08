import { TabularFileError } from "../tabular-errors";

export const SPREADSHEET_FORMATS = ["xlsx", "csv"] as const;
export type SpreadsheetFormat = (typeof SPREADSHEET_FORMATS)[number];

export const SPREADSHEET_CONTENT_TYPES: Record<SpreadsheetFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const LEGACY_OFFICE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const BINARY_SNIFF_BYTES = 4096;

export function detectSpreadsheetFormat(content: Buffer): SpreadsheetFormat {
  if (content.subarray(0, 4).equals(ZIP_SIGNATURE)) return "xlsx";
  if (content.subarray(0, 4).equals(LEGACY_OFFICE_SIGNATURE)) {
    throw new TabularFileError("صيغة xls القديمة مش مدعومة - احفظ الملف من إكسيل بصيغة xlsx أو CSV UTF-8");
  }
  if (content.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    throw new TabularFileError("الملف ده مش إكسيل (xlsx) ولا CSV");
  }
  return "csv";
}
