import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdatePositionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(["active", "inactive"]) status?: "active" | "inactive";
}
