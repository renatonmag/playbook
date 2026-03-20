import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { setupsTable } from "../schema";
import { readFileSync } from "fs";
import { resolve } from "path";

const USER_ID = "8uheCEwi7w0x4KktkKBv22XRgqsafucc";

function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ",") i++; // skip separator
    } else {
      // Unquoted field
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }
  return fields;
}

export async function seedSetups() {
  const client = postgres(process.env.VITE_DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });

  const csv = readFileSync(resolve("data/setups_rows.csv"), "utf-8");
  const lines = csv.trim().split("\n").slice(1); // skip header

  const rows = lines.map((line) => {
    const [_id, _userId, setups, _createdAt, setups2] = parseCSVRow(line);
    return {
      userId: USER_ID,
      setups: JSON.parse(setups || "[]"),
      setups2: JSON.parse(setups2 || "[]"),
    };
  });

  console.log(`Seeding ${rows.length} setups...`);
  await db.insert(setupsTable).values(rows);
  console.log("Done.");
  await client.end();
}

seedSetups().catch((err) => {
  console.error(err);
  process.exit(1);
});
