// Separate file so transaction-context.ts and database.module.ts can both import the token without a cycle.
export const KYSELY = Symbol("KYSELY");
