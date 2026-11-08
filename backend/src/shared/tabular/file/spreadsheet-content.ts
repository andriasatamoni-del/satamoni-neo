export class UnreadableCell {
  constructor(readonly reason: string) {}
}

export type RawCell = string | number | boolean | Date | UnreadableCell | null;
export type FilledCell = Exclude<RawCell, UnreadableCell | null>;
export type WritableCell = string | number | Date | null;

export interface RawRow {
  line: number;
  cells: RawCell[];
}

export interface RawSheet {
  rows: RawRow[];
  decimalComma: boolean;
}

export interface ColumnLayout {
  header: string;
  width: number;
  excelNumberFormat?: string;
}

export interface SheetToWrite {
  sheetName: string;
  columns: ColumnLayout[];
  rows: WritableCell[][];
}

export interface ReadLimits {
  maxDataRows: number;
  maxUncompressedBytes: number;
  preferredSheetName: string;
}

export function isBlankCell(cell: RawCell): boolean {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

export function dateOnlyString(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function cellText(cell: RawCell): string {
  if (cell === null) return "";
  if (cell instanceof UnreadableCell) return cell.reason;
  if (cell instanceof Date) return dateOnlyString(cell);
  if (typeof cell === "number") return Number.isInteger(cell) ? String(cell) : String(Number(cell.toPrecision(15)));
  return String(cell).trim();
}
