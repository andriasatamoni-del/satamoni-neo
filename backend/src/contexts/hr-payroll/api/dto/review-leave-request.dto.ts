import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewLeaveRequestDto {
  @IsIn(["approve", "reject"]) decision!: "approve" | "reject";
  @IsOptional() @IsString() notes?: string;
}
