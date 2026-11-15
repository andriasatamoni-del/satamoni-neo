import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";
import type { Role } from "../../domain/role";

export class ListUsersQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: Role;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
