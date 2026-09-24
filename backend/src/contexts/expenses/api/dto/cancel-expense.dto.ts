import { IsString, MinLength } from "class-validator";

export class CancelExpenseDto {
  @IsString() @MinLength(1) reason!: string;
}
