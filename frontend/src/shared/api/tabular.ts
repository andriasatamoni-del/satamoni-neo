import { API_BASE_URL, ApiError, getToken } from "./client";
import { friendlyErrorMessage } from "./errors";

export type TabularFormat = "xlsx" | "csv";

export type TabularQuery = Record<string, string | number | boolean | null | undefined>;

export interface TabularIssue {
  row: number;
  column?: string;
  message: string;
}

export interface TabularImportReport {
  dryRun: boolean;
  committed: boolean;
  totalRows: number;
  checkedRows: number;
  created: number;
  updated: number;
  unchanged: number;
  issueCount: number;
  issues: TabularIssue[];
}

export class TabularImportRejected extends ApiError {
  constructor(
    message: string,
    readonly report: TabularImportReport
  ) {
    super(message, 422, report);
    this.name = "TabularImportRejected";
  }
}

const UNPROCESSABLE = 422;

function tabularUrl(path: string, action: string, query: TabularQuery): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(name, String(value));
  }
  const search = params.toString();
  return `${API_BASE_URL}${path}/${action}${search ? `?${search}` : ""}`;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function failure(res: Response): Promise<ApiError> {
  const payload = await res.json().catch(() => null);
  const message = friendlyErrorMessage(res.status, payload?.error ?? payload?.message);
  if (res.status === UNPROCESSABLE && Array.isArray(payload?.issues)) return new TabularImportRejected(message, payload as TabularImportReport);
  return new ApiError(message, res.status, payload);
}

function fileNameFrom(res: Response, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return match?.[1] ?? fallback;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function download(path: string, action: "export" | "import-template", query: TabularQuery, format: TabularFormat): Promise<void> {
  const res = await fetch(tabularUrl(path, action, { ...query, format }), { headers: authHeaders() });
  if (!res.ok) throw await failure(res);
  saveBlob(await res.blob(), fileNameFrom(res, `${action}.${format}`));
}

export function exportTabular(path: string, format: TabularFormat, query: TabularQuery = {}): Promise<void> {
  return download(path, "export", query, format);
}

export function downloadTabularTemplate(path: string, format: TabularFormat): Promise<void> {
  return download(path, "import-template", {}, format);
}

export async function importTabular(path: string, file: File, options: { dryRun: boolean; branchId?: string }): Promise<TabularImportReport> {
  const body = new FormData();
  body.append("file", file, file.name);
  const res = await fetch(tabularUrl(path, "import", { dryRun: options.dryRun, branchId: options.branchId }), {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}
