import { IsOptional, IsString } from "class-validator";

export class RegisterDepartmentDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
}
