import { eq, or } from "drizzle-orm";
import { db } from "~/db";
import { usersTable } from "~/db/schema";

export const findUser = async (usernameOrEmail: string) => {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(
      or(
        eq(usersTable.userName, usernameOrEmail),
        eq(usersTable.email, usernameOrEmail),
      ),
    );
  return row ?? null;
};
