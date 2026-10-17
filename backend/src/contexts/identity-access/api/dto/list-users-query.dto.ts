import { IsIn, IsOptional } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";
import { ROLES, type Role } from "../../domain/role";

export class ListUsersQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
