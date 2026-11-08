import type { AnySheetColumn, ColumnValue } from "./sheet-column";
import { normalizeHeader } from "./text-matching";

export interface SheetDefinition<C extends readonly AnySheetColumn[] = readonly AnySheetColumn[]> {
  readonly name: string;
  readonly sheetName: string;
  readonly columns: C;
  readonly key?: C[number]["key"];
}

type ColumnsOf<S extends SheetDefinition> = S["columns"][number];
type RequiredColumns<S extends SheetDefinition> = Extract<ColumnsOf<S>, { isRequired: true }>;
type OptionalColumns<S extends SheetDefinition> = Exclude<ColumnsOf<S>, { isRequired: true }>;

export type SheetRow<S extends SheetDefinition> = {
  [Col in RequiredColumns<S> as Col["key"]]: ColumnValue<Col>;
} & {
  [Col in OptionalColumns<S> as Col["key"]]?: ColumnValue<Col> | null;
};

const FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FORBIDDEN_SHEET_NAME_CHARACTERS = /[\\/?*[\]:]/;
const MAX_SHEET_NAME_LENGTH = 31;

export function defineSheet<const C extends readonly AnySheetColumn[]>(sheet: SheetDefinition<C>): SheetDefinition<C> {
  if (!FILE_NAME.test(sheet.name)) throw new Error(`sheet name must be a kebab-case slug: ${sheet.name}`);
  if (!sheet.sheetName || sheet.sheetName.length > MAX_SHEET_NAME_LENGTH || FORBIDDEN_SHEET_NAME_CHARACTERS.test(sheet.sheetName)) {
    throw new Error(`invalid Excel sheet name for ${sheet.name}: ${sheet.sheetName}`);
  }
  if (sheet.columns.length === 0) throw new Error(`sheet ${sheet.name} has no columns`);
  const seenHeaders = new Set<string>();
  for (const col of sheet.columns) {
    for (const label of [col.key, col.header]) {
      const normalized = normalizeHeader(label);
      if (seenHeaders.has(normalized)) throw new Error(`sheet ${sheet.name} repeats the column ${label}`);
      seenHeaders.add(normalized);
    }
  }
  if (sheet.key !== undefined && !sheet.columns.some((col) => col.key === sheet.key && col.isRequired)) {
    throw new Error(`the key of sheet ${sheet.name} must be one of its required columns: ${sheet.key}`);
  }
  return sheet;
}
