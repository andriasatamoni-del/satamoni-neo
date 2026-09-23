import { IsInt, Min } from "class-validator";

export class CloseFiscalYearDto {
  @IsInt()
  @Min(2000)
  year!: number;
}
