import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { TabularFileError } from "../tabular-errors";
import { dateOnlyString, type RawSheet, type SheetToWrite, type WritableCell } from "./spreadsheet-content";

const DELIMITERS = [",", ";", "\t"] as const;
const UTF8_BOM = "﻿";
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const SIGNED_NUMBER_TEXT = /^[+-]?\d[\d\s.,]*$/;
const ESCAPED_FORMULA = /^'(?=[=+\-@\t\r])/;

export function readCsv(content: Buffer): RawSheet {
  const text = decodeUtf8(content);
  const delimiter = detectDelimiter(text);
  let records: string[][];
  try {
    records = parse(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: false });
  } catch (err) {
    const line = (err as { lines?: number }).lines;
    throw new TabularFileError(`ملف الـCSV مش مظبوط${line ? ` عند السطر ${line}` : ""} (غالبًا علامة تنصيص " مش مقفولة)`);
  }
  return {
    rows: records.map((fields, index) => ({ line: index + 1, cells: fields.map(removeFormulaEscape) })),
    decimalComma: delimiter === ";",
  };
}

export function writeCsv(sheet: SheetToWrite): Buffer {
  const records = [sheet.columns.map((col) => toCsvField(col.header)), ...sheet.rows.map((row) => row.map(toCsvField))];
  return Buffer.from(UTF8_BOM + stringify(records, { record_delimiter: "windows" }), "utf8");
}

function decodeUtf8(content: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content).replace(/^﻿/, "");
  } catch {
    throw new TabularFileError('ملف الـCSV مش بترميز UTF-8 - احفظه من إكسيل باختيار "CSV UTF-8"');
  }
}

function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && (character === "\n" || character === "\r")) break;
    else if (!quoted && counts.has(character)) counts.set(character, counts.get(character)! + 1);
  }
  let best: string = DELIMITERS[0];
  for (const [delimiter, count] of counts) if (count > counts.get(best)!) best = delimiter;
  return best;
}

function removeFormulaEscape(field: string): string {
  return field.replace(ESCAPED_FORMULA, "");
}

function toCsvField(cell: WritableCell): string | number {
  if (cell === null) return "";
  if (cell instanceof Date) return dateOnlyString(cell);
  if (typeof cell === "string" && FORMULA_TRIGGER.test(cell) && !SIGNED_NUMBER_TEXT.test(cell)) return `'${cell}`;
  return cell;
}
