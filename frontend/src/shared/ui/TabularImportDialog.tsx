import { useState } from "react";
import { createPortal } from "react-dom";
import { errorMessage } from "../api/errorMessage";
import { downloadTabularTemplate, importTabular, TabularImportRejected, type TabularFormat, type TabularImportReport } from "../api/tabular";
import { Button } from "./Button";
import { Table, TBody, TD, TH, THead, TR } from "./Table";

type ImportStep =
  | { kind: "choose" }
  | { kind: "checked"; report: TabularImportReport }
  | { kind: "rejected"; message: string; report: TabularImportReport }
  | { kind: "imported"; report: TabularImportReport };

const ACCEPTED_FILES = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export function TabularImportDialog({
  path,
  title,
  branchId,
  onImported,
  onClose,
}: {
  path: string;
  title: string;
  branchId?: string;
  onImported: (report: TabularImportReport) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<ImportStep>({ kind: "choose" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(next: File | null) {
    setFile(next);
    setStep({ kind: "choose" });
    setError(null);
  }

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const report = await importTabular(path, file, { dryRun, branchId });
      setStep(dryRun ? { kind: "checked", report } : { kind: "imported", report });
      if (!dryRun) onImported(report);
    } catch (err) {
      if (err instanceof TabularImportRejected) setStep({ kind: "rejected", message: err.message, report: err.report });
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate(format: TabularFormat) {
    setError(null);
    try {
      await downloadTabularTemplate(path, format);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const imported = step.kind === "imported";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`استيراد ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">استيراد {title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="text-slate-400 hover:text-slate-700">×</button>
        </div>

        {!imported && (
          <>
            <p className="text-sm text-slate-600">
              ارفع ملف Excel أو CSV بنفس أعمدة النموذج. الملف بيتفحص الأول، ومفيش حاجة بتتسجّل غير لما تأكد، ولو أي سطر فيه مشكلة مفيش ولا سطر بيتسجّل.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>نزّل نموذج فاضي:</span>
              <button type="button" onClick={() => void downloadTemplate("xlsx")} className="font-semibold text-brand-600 hover:underline">Excel</button>
              <span>·</span>
              <button type="button" onClick={() => void downloadTemplate("csv")} className="font-semibold text-brand-600 hover:underline">CSV</button>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">الملف</span>
              <input
                type="file"
                accept={ACCEPTED_FILES}
                onClick={(e) => (e.currentTarget.value = "")}
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
              />
            </label>
          </>
        )}

        {step.kind === "checked" && (
          <ReportSummary heading={`الملف سليم - ${step.report.totalRows} سطر جاهز للاستيراد`} report={step.report} future />
        )}
        {step.kind === "rejected" && <RejectedReport message={step.message} report={step.report} />}
        {step.kind === "imported" && <ReportSummary heading={`تم الاستيراد - ${step.report.totalRows} سطر`} report={step.report} />}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{imported ? "إغلاق" : "إلغاء"}</Button>
          {step.kind === "checked" ? (
            <Button type="button" disabled={busy} onClick={() => void send(false)}>{busy ? "بيستورد..." : "تأكيد الاستيراد"}</Button>
          ) : (
            !imported && <Button type="button" disabled={!file || busy} onClick={() => void send(true)}>{busy ? "بيتفحص..." : "فحص الملف"}</Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ReportSummary({ heading, report, future = false }: { heading: string; report: TabularImportReport; future?: boolean }) {
  const counts = [
    { label: future ? "هيتضاف" : "اتضاف", value: report.created },
    { label: future ? "هيتعدّل" : "اتعدّل", value: report.updated },
    { label: "من غير تغيير", value: report.unchanged },
  ];
  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      <p className="font-semibold">{heading}</p>
      <p className="mt-1">{counts.map((count) => `${count.label}: ${count.value}`).join(" · ")}</p>
    </div>
  );
}

function RejectedReport({ message, report }: { message: string; report: TabularImportReport }) {
  const hidden = report.issueCount - report.issues.length;
  return (
    <div className="space-y-2">
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{message}</p>
      <Table>
        <THead>
          <TR>
            <TH>السطر</TH>
            <TH>العمود</TH>
            <TH>المشكلة</TH>
          </TR>
        </THead>
        <TBody>
          {report.issues.map((issue, index) => (
            <TR key={index}>
              <TD>{issue.row}</TD>
              <TD>{issue.column ?? "—"}</TD>
              <TD>{issue.message}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {hidden > 0 && <p className="text-xs text-slate-500">وفيه {hidden} مشكلة تانية مش ظاهرة - صلّح اللي فوق وافحص الملف تاني.</p>}
    </div>
  );
}
