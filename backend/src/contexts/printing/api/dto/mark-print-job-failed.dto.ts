import { IsOptional, IsString } from "class-validator";

export class MarkPrintJobFailedDto {
  @IsOptional() @IsString() error?: string;
}
