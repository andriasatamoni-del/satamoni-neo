import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateDepartmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(["active", "inactive"]) status?: "active" | "inactive";
}
