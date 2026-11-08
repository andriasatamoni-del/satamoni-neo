import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { errorMessage } from "../api/errorMessage";
import { exportTabular, type TabularFormat, type TabularImportReport, type TabularQuery } from "../api/tabular";
import { useCan } from "../auth/AuthContext";
import type { Permission } from "../auth/permissions";
import { Button } from "./Button";
import { TabularImportDialog } from "./TabularImportDialog";

export interface TabularImportExportProps {
  path: string;
  title: string;
  permissions: { export: readonly Permission[]; import: readonly Permission[] };
  exportQuery?: TabularQuery;
  branchId?: string;
  refreshQueryKey?: QueryKey;
  onImported?: (report: TabularImportReport) => void;
}

const FORMAT_LABELS: Record<TabularFormat, string> = { xlsx: "Excel (xlsx)", csv: "CSV" };

export function TabularImportExport({ path, title, permissions, exportQuery = {}, branchId, refreshQueryKey, onImported }: TabularImportExportProps) {
  const allowed = useCan();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const canExport = allowed(...permissions.export);
  const canImport = allowed(...permissions.import);
  if (!canExport && !canImport) return null;

  function handleImported(report: TabularImportReport) {
    if (refreshQueryKey) void queryClient.invalidateQueries({ queryKey: refreshQueryKey });
    onImported?.(report);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canExport && <ExportMenu path={path} query={{ ...exportQuery, branchId }} />}
      {canImport && (
        <Button type="button" variant="secondary" size="sm" onClick={() => setImporting(true)}>
          استيراد
        </Button>
      )}
      {importing && (
        <TabularImportDialog path={path} title={title} branchId={branchId} onImported={handleImported} onClose={() => setImporting(false)} />
      )}
    </div>
  );
}

function ExportMenu({ path, query }: { path: string; query: TabularQuery }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  async function exportAs(format: TabularFormat) {
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await exportTabular(path, format, query);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={menu} className="relative">
      <Button type="button" variant="secondary" size="sm" disabled={busy} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {busy ? "بيتصدّر..." : "تصدير"}
      </Button>
      {open && (
        <div role="menu" className="absolute end-0 z-20 mt-1 min-w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {(Object.keys(FORMAT_LABELS) as TabularFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => void exportAs(format)}
              className="block w-full px-3 py-1.5 text-start text-sm text-slate-700 hover:bg-slate-50"
            >
              {FORMAT_LABELS[format]}
            </button>
          ))}
        </div>
      )}
      {error && <p className="absolute end-0 mt-1 w-64 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
