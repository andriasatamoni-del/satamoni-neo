import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";

// Separate file so transaction-context.ts and database.module.ts can both import the token without a cycle.
// Repositories inject it as `@Inject(DATABASE) private readonly db: Database`. A token is needed because the injected
// value is a plain object (the transactional Proxy over Drizzle, see transaction-context.ts), not a class.
export const DATABASE = Symbol("DATABASE");

export type Database = NodePgDatabase<typeof schema>;
