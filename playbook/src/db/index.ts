import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
async function main() {
    // Disable prefetch as it is not supported for "Transaction" pool mode 
    const client = postgres(import.meta.env.VITE_DATABASE_URL, { prepare: false })
    const db = drizzle({ client });
}
main();