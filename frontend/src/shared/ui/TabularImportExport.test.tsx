import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { TabularImportExport } from "./TabularImportExport";
import { PERMISSION } from "../auth/permissions";
import { renderWithAuth } from "../../test/render";
import { apiMock } from "../../test/apiMock";
import { seededUser } from "../../test/seedRoles";
import { exportTabular, importTabular, TabularImportRejected, type TabularImportReport } from "../api/tabular";

vi.mock("../api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

vi.mock("../api/tabular", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  exportTabular: vi.fn(),
  importTabular: vi.fn(),
  downloadTabularTemplate: vi.fn(),
}));

const PERMISSIONS = { export: [PERMISSION.INVENTORY_ITEMS_VIEW], import: [PERMISSION.INVENTORY_ITEMS_MANAGE] };

function report(overrides: Partial<TabularImportReport> = {}): TabularImportReport {
  return { dryRun: true, committed: false, totalRows: 3, checkedRows: 3, created: 2, updated: 1, unchanged: 0, issueCount: 0, issues: [], ...overrides };
}

function renderAsAdmin(onImported = vi.fn()) {
  renderWithAuth(
    <TabularImportExport path="/inventory/items" title="أصناف المخزون" permissions={PERMISSIONS} exportQuery={{ q: "سكر", itemType: "" }} onImported={onImported} />,
    { user: seededUser("admin") }
  );
  return onImported;
}

function chooseFile() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["اسم الصنف\n"], "items.csv", { type: "text/csv" })] } });
}

beforeEach(() => {
  apiMock.reset();
  vi.mocked(exportTabular).mockReset().mockResolvedValue();
  vi.mocked(importTabular).mockReset();
});

describe("TabularImportExport", () => {
  it("shows each action only to users with its permission", async () => {
    renderWithAuth(<TabularImportExport path="/inventory/items" title="أصناف المخزون" permissions={PERMISSIONS} />, {
      user: seededUser("cashier", { permissions: [PERMISSION.INVENTORY_ITEMS_VIEW] }),
    });
    expect(await screen.findByText("تصدير")).toBeInTheDocument();
    expect(screen.queryByText("استيراد")).toBeNull();
  });

  it("exports the chosen format with the current filters", async () => {
    renderAsAdmin();
    fireEvent.click(await screen.findByText("تصدير"));
    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    await waitFor(() => expect(exportTabular).toHaveBeenCalledWith("/inventory/items", "csv", { q: "سكر", itemType: "", branchId: undefined }));
  });

  it("checks the file first and imports only after confirmation", async () => {
    const onImported = renderAsAdmin();
    vi.mocked(importTabular).mockResolvedValueOnce(report()).mockResolvedValueOnce(report({ dryRun: false, committed: true }));

    fireEvent.click(await screen.findByText("استيراد"));
    chooseFile();
    fireEvent.click(screen.getByText("فحص الملف"));
    expect(await screen.findByText("الملف سليم - 3 سطر جاهز للاستيراد")).toBeInTheDocument();
    expect(screen.getByText("هيتضاف: 2 · هيتعدّل: 1 · من غير تغيير: 0")).toBeInTheDocument();
    expect(importTabular).toHaveBeenLastCalledWith("/inventory/items", expect.any(File), { dryRun: true, branchId: undefined });

    fireEvent.click(screen.getByText("تأكيد الاستيراد"));
    expect(await screen.findByText("تم الاستيراد - 3 سطر")).toBeInTheDocument();
    expect(importTabular).toHaveBeenLastCalledWith("/inventory/items", expect.any(File), { dryRun: false, branchId: undefined });
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ committed: true }));
  });

  it("lists every problem of a rejected file and does not offer to import it", async () => {
    renderAsAdmin();
    const rejected = report({ issueCount: 1, issues: [{ row: 2, column: "الوحدة", message: "القيمة دي إلزامية" }] });
    vi.mocked(importTabular).mockRejectedValueOnce(new TabularImportRejected("الملف فيه 1 خطأ", rejected));

    fireEvent.click(await screen.findByText("استيراد"));
    chooseFile();
    fireEvent.click(screen.getByText("فحص الملف"));
    expect(await screen.findByText("القيمة دي إلزامية")).toBeInTheDocument();
    expect(screen.getByText("الملف فيه 1 خطأ")).toBeInTheDocument();
    expect(screen.queryByText("تأكيد الاستيراد")).toBeNull();
  });
});
