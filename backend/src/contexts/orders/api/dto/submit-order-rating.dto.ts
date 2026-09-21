import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class SubmitOrderRatingDto {
  @IsUUID()
  token!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional() @IsString() comment?: string;
}
