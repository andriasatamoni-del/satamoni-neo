import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ListQueryDto } from "../http/list-query.dto";

export class ListAuditLogsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  entityId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  action?: string;

  @IsOptional()
  @IsIn(["SUCCESS", "DENIED", "FAILED"])
  outcome?: string;
}
