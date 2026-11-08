import { DomainError } from "../domain/domain-error";

export class TabularFileError extends DomainError {
  readonly httpStatus = 400;
}

export class TabularTooManyRowsError extends TabularFileError {
  constructor(maxDataRows: number) {
    super(`الملف فيه أكتر من ${maxDataRows} سطر - قسّمه على كذا ملف`);
  }
}

export class TabularBranchRequiredError extends DomainError {
  readonly httpStatus = 400;

  constructor() {
    super("اختار الفرع اللي هتستورد عليه (branchId)");
  }
}

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

export class TabularImportRejectedError extends DomainError {
  readonly httpStatus = 422;

  constructor(readonly report: TabularImportReport) {
    super(
      report.checkedRows < report.totalRows && report.checkedRows > 0
        ? `السطر ${report.issues[0]?.row} فيه مشكلة - مفيش ولا سطر اتسجّل، والسطور اللي بعده لسه متراجعتش. صلّحه وارفع الملف تاني`
        : `الملف فيه ${report.issueCount} خطأ - مفيش ولا سطر اتسجّل. صلّح الأخطاء وارفعه تاني`
    );
  }
}
