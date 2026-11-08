import { cellText, dateOnlyString, isBlankCell, UnreadableCell, type FilledCell, type RawCell, type WritableCell } from "../file/spreadsheet-content";
import { normalizeForMatching, toWesternDigits } from "./text-matching";

export interface CellReadOptions {
  decimalComma: boolean;
}

export type CellReadResult<V> = { ok: true; value: V } | { ok: false; message: string };

interface ColumnType<V> {
  read(cell: FilledCell, options: CellReadOptions): CellReadResult<V>;
  write(value: V): WritableCell;
  readonly excelNumberFormat?: string;
  readonly defaultWidth: number;
}

const DEFAULT_WIDTH = 20;

export class SheetColumn<K extends string = string, V = unknown, R extends boolean = boolean> {
  constructor(
    readonly key: K,
    readonly header: string,
    private readonly type: ColumnType<V>,
    readonly isRequired: R,
    readonly width = type.defaultWidth
  ) {}

  required(): SheetColumn<K, V, true> {
    return new SheetColumn(this.key, this.header, this.type, true, this.width);
  }

  withWidth(width: number): SheetColumn<K, V, R> {
    return new SheetColumn(this.key, this.header, this.type, this.isRequired, width);
  }

  get excelNumberFormat(): string | undefined {
    return this.type.excelNumberFormat;
  }

  read(cell: RawCell, options: CellReadOptions = { decimalComma: false }): CellReadResult<V | null> {
    if (isBlankCell(cell)) return this.isRequired ? fail("القيمة دي إلزامية") : ok(null);
    if (cell instanceof UnreadableCell) return fail(`الخلية فيها خطأ إكسيل (${cell.reason})`);
    return this.type.read(cell as FilledCell, options);
  }

  write(value: V | null | undefined): WritableCell {
    return value === null || value === undefined ? null : this.type.write(value);
  }
}

export type AnySheetColumn = SheetColumn<string, any, boolean>;

export type ColumnValue<C> = C extends SheetColumn<string, infer V, boolean> ? V : never;

export interface EnumOption<V extends string> {
  value: V;
  label: string;
}

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "نعم", "صح"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "لا", "غلط"]);
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const LAST_EXCEL_DATE_SERIAL = 2_958_465;
const STRICT_NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)$/;
const COMMA_GROUPED = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const DOT_GROUPED = /^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/;
const ISO_DATE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const DAY_FIRST_DATE = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;

function ok<V>(value: V): CellReadResult<V> {
  return { ok: true, value };
}

function fail<V>(message: string): CellReadResult<V> {
  return { ok: false, message };
}

function textType(options: { maxLength?: number }): ColumnType<string> {
  return {
    defaultWidth: DEFAULT_WIDTH,
    read(cell) {
      if (typeof cell === "number" && Number.isInteger(cell) && !Number.isSafeInteger(cell)) {
        return fail("الرقم ده طويل وإكسيل قرّبه - خلّي تنسيق العمود نص (Text) واكتبه تاني");
      }
      const text = cellText(cell);
      if (options.maxLength !== undefined && text.length > options.maxLength) {
        return fail(`النص أطول من ${options.maxLength} حرف`);
      }
      return ok(text);
    },
    write: (value) => value,
  };
}

function numberFromText(raw: string, decimalComma: boolean): number | null {
  let text = toWesternDigits(raw).replace(/[\s ٬]/g, "").replace(/٫/g, ".");
  if (decimalComma) {
    if (DOT_GROUPED.test(text)) text = text.replace(/\./g, "");
    text = text.replace(",", ".");
  } else if (text.includes(",")) {
    if (!COMMA_GROUPED.test(text)) return null;
    text = text.replace(/,/g, "");
  }
  return STRICT_NUMBER.test(text) ? Number(text) : null;
}

function numberType(options: { min?: number; max?: number; integer?: boolean }): ColumnType<number> {
  return {
    defaultWidth: 14,
    read(cell, readOptions) {
      const value = typeof cell === "number" ? cell : typeof cell === "string" ? numberFromText(cell, readOptions.decimalComma) : null;
      if (value === null || !Number.isFinite(value)) return fail(`"${cellText(cell)}" مش رقم (الكسور بتتكتب بنقطة: 1.5)`);
      if (options.integer && !Number.isInteger(value)) return fail("لازم رقم صحيح من غير كسور");
      if (options.min !== undefined && value < options.min) return fail(`أقل قيمة مسموحة ${options.min}`);
      if (options.max !== undefined && value > options.max) return fail(`أكبر قيمة مسموحة ${options.max}`);
      return ok(value);
    },
    write: (value) => value,
  };
}

function booleanType(): ColumnType<boolean> {
  return {
    defaultWidth: 10,
    read(cell) {
      if (typeof cell === "boolean") return ok(cell);
      const word = normalizeForMatching(toWesternDigits(cellText(cell)));
      if (TRUE_WORDS.has(word)) return ok(true);
      if (FALSE_WORDS.has(word)) return ok(false);
      return fail(`"${cellText(cell)}" لازم تكون نعم أو لا`);
    },
    write: (value) => (value ? "نعم" : "لا"),
  };
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return dateOnlyString(date);
}

function dateFromText(raw: string): string | null {
  const text = toWesternDigits(raw);
  const iso = ISO_DATE.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dayFirst = DAY_FIRST_DATE.exec(text);
  if (dayFirst) return validDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  return null;
}

function dateType(): ColumnType<string> {
  return {
    defaultWidth: 14,
    excelNumberFormat: "yyyy-mm-dd",
    read(cell) {
      if (cell instanceof Date) return ok(dateOnlyString(cell));
      if (typeof cell === "number" && Number.isInteger(cell) && cell > 0 && cell <= LAST_EXCEL_DATE_SERIAL) {
        return ok(dateOnlyString(new Date(EXCEL_EPOCH_MS + cell * DAY_MS)));
      }
      const date = dateFromText(cellText(cell));
      return date ? ok(date) : fail(`"${cellText(cell)}" مش تاريخ صحيح (اكتبه YYYY-MM-DD أو DD/MM/YYYY)`);
    },
    write: (value) => new Date(`${value}T00:00:00.000Z`),
  };
}

function enumerationType<V extends string>(options: readonly EnumOption<V>[]): ColumnType<V> {
  const valueByText = new Map<string, V>();
  for (const option of options) {
    valueByText.set(normalizeForMatching(option.value), option.value);
    valueByText.set(normalizeForMatching(option.label), option.value);
  }
  const labelOf = new Map<V, string>(options.map((option) => [option.value, option.label]));
  const allowed = options.map((option) => option.label).join("، ");
  return {
    defaultWidth: DEFAULT_WIDTH,
    read(cell) {
      const value = valueByText.get(normalizeForMatching(cellText(cell)));
      return value === undefined ? fail(`"${cellText(cell)}" مش من القيم المسموحة (${allowed})`) : ok(value);
    },
    write: (value) => labelOf.get(value) ?? value,
  };
}

export const column = {
  text: <K extends string>(key: K, header: string, options: { maxLength?: number } = {}) =>
    new SheetColumn<K, string, false>(key, header, textType(options), false),
  number: <K extends string>(key: K, header: string, options: { min?: number; max?: number; integer?: boolean } = {}) =>
    new SheetColumn<K, number, false>(key, header, numberType(options), false),
  boolean: <K extends string>(key: K, header: string) => new SheetColumn<K, boolean, false>(key, header, booleanType(), false),
  date: <K extends string>(key: K, header: string) => new SheetColumn<K, string, false>(key, header, dateType(), false),
  enumeration: <K extends string, const V extends string>(key: K, header: string, options: readonly EnumOption<V>[]) =>
    new SheetColumn<K, V, false>(key, header, enumerationType(options), false),
};
