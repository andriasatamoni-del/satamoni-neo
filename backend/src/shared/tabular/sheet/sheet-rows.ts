import { cellText, isBlankCell, type RawRow, type RawSheet, type SheetToWrite } from "../file/spreadsheet-content";
import type { TabularIssue } from "../tabular-errors";
import type { SheetDefinition, SheetRow } from "./sheet-definition";
import { normalizeForMatching, normalizeHeader } from "./text-matching";

export interface ReadRow<R> {
  line: number;
  values: R;
}

export interface SheetReadResult<R> {
  rows: ReadRow<R>[];
  issues: TabularIssue[];
  totalRows: number;
}

type ColumnPositions = Map<string, number>;

export function readSheetRows<S extends SheetDefinition>(sheet: S, raw: RawSheet): SheetReadResult<SheetRow<S>> {
  const [headerRow, ...dataRows] = raw.rows;
  if (!headerRow) return { rows: [], issues: [{ row: 1, message: "الملف فاضي - أول سطر لازم يكون أسماء الأعمدة" }], totalRows: 0 };

  const { positions, issues } = matchHeaderToColumns(sheet, headerRow);
  if (issues.length > 0) return { rows: [], issues, totalRows: dataRows.length };

  const repeatedKeys = repeatedKeyDetector(sheet);
  const rows: ReadRow<SheetRow<S>>[] = [];
  for (const rawRow of dataRows) {
    const row = readRowValues(sheet, positions, rawRow, raw.decimalComma);
    const rowIssues = row.issues.length > 0 ? row.issues : repeatedKeys.check(row.values, rawRow.line);
    if (rowIssues.length > 0) issues.push(...rowIssues);
    else rows.push({ line: rawRow.line, values: row.values as SheetRow<S> });
  }
  return { rows, issues, totalRows: dataRows.length };
}

export function writeSheetRows<S extends SheetDefinition>(sheet: S, rows: readonly SheetRow<S>[]): SheetToWrite {
  return {
    sheetName: sheet.sheetName,
    columns: sheet.columns.map((col) => ({ header: col.header, width: col.width, excelNumberFormat: col.excelNumberFormat })),
    rows: rows.map((row) => sheet.columns.map((col) => col.write((row as Record<string, unknown>)[col.key]))),
  };
}

function matchHeaderToColumns(sheet: SheetDefinition, headerRow: RawRow): { positions: ColumnPositions; issues: TabularIssue[] } {
  const keyByHeader = new Map<string, string>();
  for (const col of sheet.columns) {
    keyByHeader.set(normalizeHeader(col.header), col.key);
    keyByHeader.set(normalizeHeader(col.key), col.key);
  }

  const positions: ColumnPositions = new Map();
  const issues: TabularIssue[] = [];
  headerRow.cells.forEach((cell, position) => {
    if (isBlankCell(cell)) return;
    const header = cellText(cell);
    const key = keyByHeader.get(normalizeHeader(header));
    if (key === undefined) {
      issues.push({ row: headerRow.line, column: header, message: `عمود مش معروف "${header}"` });
    } else if (positions.has(key)) {
      issues.push({ row: headerRow.line, column: header, message: `العمود "${header}" متكرر` });
    } else {
      positions.set(key, position);
    }
  });

  for (const col of sheet.columns) {
    if (col.isRequired && !positions.has(col.key)) {
      issues.push({ row: headerRow.line, column: col.header, message: `العمود الإلزامي "${col.header}" مش موجود` });
    }
  }
  return { positions, issues };
}

function readRowValues(
  sheet: SheetDefinition,
  positions: ColumnPositions,
  rawRow: RawRow,
  decimalComma: boolean
): { values: Record<string, unknown>; issues: TabularIssue[] } {
  const values: Record<string, unknown> = {};
  const issues: TabularIssue[] = [];
  for (const col of sheet.columns) {
    const position = positions.get(col.key);
    if (position === undefined) continue;
    const result = col.read(rawRow.cells[position] ?? null, { decimalComma });
    if (result.ok) values[col.key] = result.value;
    else issues.push({ row: rawRow.line, column: col.header, message: result.message });
  }
  return { values, issues };
}

function repeatedKeyDetector(sheet: SheetDefinition): { check(values: Record<string, unknown>, line: number): TabularIssue[] } {
  const keyColumn = sheet.columns.find((col) => col.key === sheet.key);
  const firstLineOfKey = new Map<string, number>();
  return {
    check(values, line) {
      if (!keyColumn) return [];
      const key = normalizeForMatching(String(values[keyColumn.key]));
      const firstLine = firstLineOfKey.get(key);
      if (firstLine === undefined) {
        firstLineOfKey.set(key, line);
        return [];
      }
      return [{ row: line, column: keyColumn.header, message: `القيمة دي متكررة - موجودة في السطر ${firstLine}` }];
    },
  };
}
