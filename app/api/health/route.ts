import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export async function GET() {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "up", ms: Date.now() - started });
  } catch (err) {
    return Response.json(
      { ok: false, db: "down", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
