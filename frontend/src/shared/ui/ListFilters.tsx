import { useEffect, useRef, useState, type ReactNode } from "react";
import { Field, Input, Select } from "./Field";
import type { ListState } from "./useListState";

export interface SelectFilterDef<F extends string> {
  name: F;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** label of the "no filter" option (default "الكل") */
  allLabel?: string;
}

interface ListFiltersProps<F extends string> {
  state: ListState<F>;
  /** free-text search on the `q` param */
  search?: { placeholder: string; label?: string };
  /** from/to date inputs on the `from` and `to` params (Cairo business dates) */
  dateRange?: boolean;
  selects?: Array<SelectFilterDef<F>>;
  /** extra controls rendered after the built-in ones */
  children?: ReactNode;
}

/**
 * NEO-6: the filter bar of a server-side list. Every control writes to the URL through `state`, so the server does the
 * searching and filtering and the filters survive a reload. Search text is sent 300ms after the user stops typing.
 */
export function ListFilters<F extends string>({ state, search, dateRange, selects = [], children }: ListFiltersProps<F>) {
  const filters = state.filters as Record<string, string>;
  const setFilter = state.setFilter as (name: string, value: string) => void;
  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
      {search ? (
        <Field label={search.label ?? "بحث"}>
          <DebouncedInput value={filters.q ?? ""} placeholder={search.placeholder} onCommit={(value) => setFilter("q", value)} />
        </Field>
      ) : null}
      {selects.map((def) => (
        <Field key={def.name} label={def.label}>
          <Select value={filters[def.name] ?? ""} onChange={(e) => setFilter(def.name, e.target.value)}>
            <option value="">{def.allLabel ?? "الكل"}</option>
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ))}
      {dateRange ? (
        <>
          <Field label="من تاريخ">
            <Input type="date" value={filters.from ?? ""} max={filters.to || undefined} onChange={(e) => setFilter("from", e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={filters.to ?? ""} min={filters.from || undefined} onChange={(e) => setFilter("to", e.target.value)} />
          </Field>
        </>
      ) : null}
      {children}
    </div>
  );
}

/** A text input that commits its value 300ms after the user stops typing (for filters bound to the URL). */
export function DebouncedInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value);
  // the latest callback, so a parent re-render (a refetch) does not restart the timer
  const commit = useRef(onCommit);
  commit.current = onCommit;

  // the URL changed from outside (back/forward, a reset): show it, but keep what the user is typing when it only differs
  // by surrounding spaces (the committed value is trimmed; "ahmed " must not lose its space before "ali" is typed)
  useEffect(() => setText((current) => (current.trim() === value ? current : value)), [value]);

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => commit.current(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value]);

  return <Input type="search" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />;
}
