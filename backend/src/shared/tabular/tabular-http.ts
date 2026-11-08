import { applyDecorators, StreamableFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { IsBoolean, IsIn, IsOptional, IsUUID } from "class-validator";
import { QueryBoolean } from "../http/list-query.dto";
import { SPREADSHEET_FORMATS, type SpreadsheetFormat } from "./file/spreadsheet-format";
import { MAX_TABULAR_FILE_BYTES, type TabularFile } from "./tabular.service";

export const TABULAR_UPLOAD_FIELD = "file";
const DEFAULT_IMPORTS_PER_MINUTE = 10;

export function TabularUpload(): MethodDecorator {
  return applyDecorators(
    Throttle({ default: { limit: Number(process.env.THROTTLE_IMPORT_LIMIT) || DEFAULT_IMPORTS_PER_MINUTE, ttl: 60_000 } }),
    UseInterceptors(FileInterceptor(TABULAR_UPLOAD_FIELD, { limits: { fileSize: MAX_TABULAR_FILE_BYTES + 1024, files: 1 } }))
  );
}

export class TabularExportQueryDto {
  @IsOptional()
  @IsIn(SPREADSHEET_FORMATS)
  format: SpreadsheetFormat = "xlsx";

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class TabularImportQueryDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  dryRun = false;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export function tabularDownload(file: TabularFile): StreamableFile {
  return new StreamableFile(file.content, {
    type: file.contentType,
    disposition: `attachment; filename="${file.fileName}"`,
    length: file.content.length,
  });
}
