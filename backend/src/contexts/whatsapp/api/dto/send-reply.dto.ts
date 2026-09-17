import { IsString } from "class-validator";

export class SendReplyDto {
  @IsString() body!: string;
}
