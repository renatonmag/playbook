import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
async function main() {
  // Disable prefetch as it is not supported for "Transaction" pool mode
  const client = postgres(import.meta.env.VITE_DATABASE_URL, {
    prepare: false,
  });
  const db = drizzle(client, { schema });

  return db;
}
export const db = await main();
