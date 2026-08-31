import pg from "pg";

export function createDatabasePool(connectionString: string) {
  return new pg.Pool({ connectionString, max: 12 });
}
