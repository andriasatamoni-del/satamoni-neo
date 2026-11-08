import type { AuthenticatedUser } from "../../contexts/identity-access/api/types";
import type { SheetDefinition, SheetRow } from "./sheet/sheet-definition";

export interface TabularContext {
  user: AuthenticatedUser;
  branchId: string | undefined;
}

export interface TabularImportContext<P> extends TabularContext {
  prepared: P;
  line: number;
}

export type TabularRowResult = "created" | "updated" | "unchanged";

export interface TabularRowOutcome {
  result: TabularRowResult;
  id?: string;
}

export const rowCreated = (id?: string): TabularRowOutcome => ({ result: "created", id });
export const rowUpdated = (id?: string): TabularRowOutcome => ({ result: "updated", id });
export const rowUnchanged = (id?: string): TabularRowOutcome => ({ result: "unchanged", id });

export interface TabularAdapter<S extends SheetDefinition = SheetDefinition, F extends object = object, P = undefined> {
  readonly sheet: S;
  exportRows(filter: F, context: TabularContext): Promise<SheetRow<S>[]>;
  prepare?(rows: SheetRow<S>[], context: TabularContext): Promise<P>;
  importRow(row: SheetRow<S>, context: TabularImportContext<P>): Promise<TabularRowOutcome>;
}
