import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { QueryBoolean } from "../../../../shared/http/list-query.dto";
import { TabularExportQueryDto } from "../../../../shared/tabular/tabular-http";

export class ExportCustomersQueryDto extends TabularExportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  blocked?: boolean;
}
