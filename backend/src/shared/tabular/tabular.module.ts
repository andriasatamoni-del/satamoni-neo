import { Global, Module } from "@nestjs/common";
import { TabularService } from "./tabular.service";

@Global()
@Module({
  providers: [TabularService],
  exports: [TabularService],
})
export class TabularModule {}
