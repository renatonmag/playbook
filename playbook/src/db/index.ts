import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(import.meta.env.VITE_DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
export type DB = typeof db;
