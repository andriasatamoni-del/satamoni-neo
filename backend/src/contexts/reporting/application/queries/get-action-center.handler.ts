import { Inject, Injectable } from "@nestjs/common";
import { ACTION_CENTER_READER, type ActionCenterReaderPort, type ActionCenterReport } from "../../domain/ports/action-center-reader.port";
import { businessDayEndUtc, businessDayStartUtc, businessRangeTs } from "../../../../shared/time/business-date";

const DEFAULT_RANGE_DAYS = 7;

export interface GetActionCenterQuery {
  branchId: string | null;
  from?: string;
  to?: string;
}

// المدى الافتراضي 7 أيام بس (مش 30 زي باقي التقارير) - المركز ده فحص يومي سريع، مش تقرير تحليلي طويل
// المدى، نفس فلسفة db/action-center.js بالريبو القديم بالظبط
@Injectable()
export class GetActionCenterHandler {
  constructor(@Inject(ACTION_CENTER_READER) private readonly reader: ActionCenterReaderPort) {}

  async execute(query: GetActionCenterQuery): Promise<ActionCenterReport> {
    const { fromTs, toTs } = businessRangeTs(query.from, query.to, DEFAULT_RANGE_DAYS);
    return this.reader.getAlerts({ branchId: query.branchId, fromTs, toTs });
  }
}
