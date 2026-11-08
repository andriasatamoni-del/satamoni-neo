import ExcelJS from "exceljs";
import { column } from "../../../../src/shared/tabular/sheet/sheet-column";
import { defineSheet, type SheetRow } from "../../../../src/shared/tabular/sheet/sheet-definition";
import { MAX_TABULAR_UNCOMPRESSED_BYTES, TabularService } from "../../../../src/shared/tabular/tabular.service";
import { TabularFileError } from "../../../../src/shared/tabular/tabular-errors";
import { detectSpreadsheetFormat } from "../../../../src/shared/tabular/file/spreadsheet-format";
import type { TransactionService } from "../../../../src/shared/database/transaction-context";

const SHEET = defineSheet({
  name: "test-items",
  sheetName: "أصناف",
  key: "name",
  columns: [
    column.text("name", "الاسم").required(),
    column.number("cost", "التكلفة", { min: 0 }),
    column.number("qty", "الكمية", { integer: true }),
    column.boolean("active", "نشط"),
    column.date("since", "من تاريخ"),
    column.enumeration("kind", "النوع", [
      { value: "raw", label: "خام" },
      { value: "made", label: "مُصنّع" },
    ]),
  ],
});

type Row = SheetRow<typeof SHEET>;

const service = new TabularService({} as TransactionService);

function csv(text: string): { buffer: Buffer } {
  return { buffer: Buffer.from(text, "utf8") };
}

async function xlsx(build: (workbook: ExcelJS.Workbook) => void): Promise<{ buffer: Buffer }> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
}

describe("sheet definition typing", () => {
  it("makes required columns non-null and optional ones absent-or-null", () => {
    const row: Row = { name: "x", cost: null, kind: "raw" };
    const name: string = row.name;
    // @ts-expect-error optional columns may be missing or null
    const cost: number = row.cost;
    // @ts-expect-error enum columns only accept their values
    const kind: Row["kind"] = "other";
    expect([name, cost, kind]).toBeDefined();
  });

  it("rejects duplicate headers and a key that is not a required column", () => {
    expect(() => defineSheet({ name: "dup", sheetName: "x", columns: [column.text("a", "اسم"), column.text("b", "اسم")] })).toThrow(/repeats/);
    expect(() => defineSheet({ name: "key", sheetName: "x", key: "a", columns: [column.text("a", "اسم")] })).toThrow(/key/);
  });
});

describe("reading CSV", () => {
  it("maps headers in any order and coerces every column type", async () => {
    const sheet = await service.readFile(
      SHEET,
      csv("﻿kind,الاسم,التكلفة,الكمية,نشط,من تاريخ\nمصنع,فول,١٢٫٥,3,نعم,05/11/2026\nraw,\"عيش, بلدي\",\"1,250\",,لا,2026-01-31\n")
    );
    expect(sheet.issues).toEqual([]);
    expect(sheet.rows).toEqual([
      { line: 2, values: { name: "فول", cost: 12.5, qty: 3, active: true, since: "2026-11-05", kind: "made" } },
      { line: 3, values: { name: "عيش, بلدي", cost: 1250, qty: null, active: false, since: "2026-01-31", kind: "raw" } },
    ]);
  });

  it("leaves columns that are not in the file out of the row", async () => {
    const sheet = await service.readFile(SHEET, csv("الاسم,التكلفة\nزيت,\n"));
    expect(sheet.rows[0].values).toEqual({ name: "زيت", cost: null });
  });

  it("reads a semicolon CSV with decimal commas", async () => {
    const sheet = await service.readFile(SHEET, csv("الاسم;التكلفة\nسكر;1,5\nملح;1.250,75\n"));
    expect(sheet.rows.map((row) => row.values.cost)).toEqual([1.5, 1250.75]);
  });

  it("rejects a comma that is not a thousands separator in a comma CSV", async () => {
    const sheet = await service.readFile(SHEET, csv('الاسم,التكلفة\nسكر,"1,5"\n'));
    expect(sheet.issues).toEqual([{ row: 2, column: "التكلفة", message: '"1,5" مش رقم (الكسور بتتكتب بنقطة: 1.5)' }]);
  });

  it("reports every invalid cell with its row number and column", async () => {
    const sheet = await service.readFile(SHEET, csv("الاسم,التكلفة,الكمية,من تاريخ,النوع\n,-1,2.5,2026-02-30,خشب\nسليم,1,1,,\n"));
    expect(sheet.rows.map((row) => row.line)).toEqual([3]);
    expect(sheet.issues.map((issue) => [issue.row, issue.column])).toEqual([
      [2, "الاسم"],
      [2, "التكلفة"],
      [2, "الكمية"],
      [2, "من تاريخ"],
      [2, "النوع"],
    ]);
  });

  it("reports a repeated key inside the file", async () => {
    const sheet = await service.readFile(SHEET, csv("الاسم\nأرز\nارز\n"));
    expect(sheet.issues).toEqual([{ row: 3, column: "الاسم", message: "القيمة دي متكررة - موجودة في السطر 2" }]);
  });

  it("rejects unknown, duplicated and missing required headers without counting the header as data", async () => {
    const sheet = await service.readFile(SHEET, csv("التكلفة,ملاحظات,التكلفة\n1,x,2\n"));
    expect(sheet.totalRows).toBe(1);
    expect(sheet.issues.map((issue) => issue.message)).toEqual([
      'عمود مش معروف "ملاحظات"',
      'العمود "التكلفة" متكرر',
      'العمود الإلزامي "الاسم" مش موجود',
    ]);
  });

  it("skips blank lines but keeps the spreadsheet row numbers", async () => {
    const sheet = await service.readFile(SHEET, csv("الاسم\n\nأ\n,,\nب\n"));
    expect(sheet.rows.map((row) => [row.line, row.values.name])).toEqual([
      [3, "أ"],
      [5, "ب"],
    ]);
  });

  it("tolerates a stray quote inside a value", async () => {
    const sheet = await service.readFile(SHEET, csv('الاسم,التكلفة\nصاج 12" بيتزا,5\n'));
    expect(sheet.rows[0].values).toEqual({ name: 'صاج 12" بيتزا', cost: 5 });
  });

  it("refuses non UTF-8 text, legacy xls, binary files and empty uploads", async () => {
    await expect(service.readFile(SHEET, { buffer: Buffer.from([0x61, 0xe1, 0x0a]) })).rejects.toThrow(/UTF-8/);
    await expect(service.readFile(SHEET, { buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]) })).rejects.toThrow(/xls/);
    await expect(service.readFile(SHEET, { buffer: Buffer.from([0x41, 0x00, 0x42]) })).rejects.toBeInstanceOf(TabularFileError);
    await expect(service.readFile(SHEET, undefined)).rejects.toBeInstanceOf(TabularFileError);
  });
});

describe("reading xlsx", () => {
  it("bounds the width by the header and ignores a stray far-right cell", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("أصناف");
      sheet.addRow(["الاسم", "التكلفة"]);
      sheet.addRow(["زيت", 0.1 + 0.2]);
      sheet.getCell(2, 16000).value = "x";
    });
    const sheet = await service.readFile(SHEET, file);
    expect(sheet.issues).toEqual([]);
    expect(sheet.rows[0].values).toEqual({ name: "زيت", cost: 0.30000000000000004 });
  });

  it("prefers the sheet named like the schema over a leading instructions sheet", async () => {
    const file = await xlsx((workbook) => {
      workbook.addWorksheet("تعليمات").addRow(["اقرا الأول"]);
      workbook.addWorksheet("أصناف").addRow(["الاسم"]).worksheet.addRow(["عدس"]);
    });
    expect((await service.readFile(SHEET, file)).rows[0].values).toEqual({ name: "عدس" });
  });

  it("reports formulas without a cached value and numbers too long for text columns", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("أصناف");
      sheet.addRow(["الاسم", "التكلفة"]);
      sheet.addRow([2 ** 60, { formula: "1+1" } as ExcelJS.CellFormulaValue]);
    });
    const sheet = await service.readFile(SHEET, file);
    expect(sheet.issues.map((issue) => issue.column)).toEqual(["الاسم", "التكلفة"]);
    expect(sheet.issues[1].message).toContain("صيغة من غير قيمة محسوبة");
  });

  it("refuses a workbook whose declared uncompressed size is above the limit", async () => {
    const { buffer } = await xlsx((workbook) => workbook.addWorksheet("أصناف").addRow(["الاسم"]));
    const entry = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buffer.writeUInt32LE(MAX_TABULAR_UNCOMPRESSED_BYTES + 1, entry + 24);
    await expect(service.readFile(SHEET, { buffer })).rejects.toThrow(/فك الضغط/);
  });
});

describe("writing and reading back", () => {
  const rows: Row[] = [
    { name: "=HYPERLINK(\"x\")", cost: 10.25, qty: 4, active: true, since: "2026-03-01", kind: "made" },
    { name: "-دقيق", cost: null, qty: null, active: null, since: null, kind: null },
    { name: "+201001234567", cost: 1, qty: 1, active: false, since: "2026-01-01", kind: "raw" },
  ];

  it("round-trips through xlsx", async () => {
    const file = await service.export(SHEET, rows, "xlsx");
    expect(file.fileName).toMatch(/^test-items-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(detectSpreadsheetFormat(file.content)).toBe("xlsx");
    const sheet = await service.readFile(SHEET, { buffer: file.content });
    expect(sheet.issues).toEqual([]);
    expect(sheet.rows.map((row) => row.values)).toEqual(rows);
  });

  it("writes xlsx with the header row and real date cells", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await service.export(SHEET, rows, "xlsx")).content as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("أصناف")!;
    expect(sheet.getRow(1).values).toEqual([undefined, "الاسم", "التكلفة", "الكمية", "نشط", "من تاريخ", "النوع"]);
    expect(sheet.getCell("E2").value).toEqual(new Date("2026-03-01T00:00:00.000Z"));
  });

  it("neutralises formulas in CSV without changing values on re-import", async () => {
    const file = await service.export(SHEET, rows, "csv");
    const text = file.content.toString("utf8");
    expect(text.startsWith("﻿الاسم,التكلفة,")).toBe(true);
    expect(text).toContain("\"'=HYPERLINK(\"\"x\"\")\",10.25,4,نعم,2026-03-01,مُصنّع\r\n");
    expect(text).toContain("'-دقيق,");
    expect(text).toContain("\r\n+201001234567,");
    const sheet = await service.readFile(SHEET, { buffer: file.content });
    expect(sheet.rows.map((row) => row.values)).toEqual(rows);
  });

  it("produces a header-only template", async () => {
    const file = await service.template(SHEET, "csv");
    expect(file.fileName).toBe("test-items-template.csv");
    expect(file.content.toString("utf8")).toBe("﻿الاسم,التكلفة,الكمية,نشط,من تاريخ,النوع\r\n");
  });
});
