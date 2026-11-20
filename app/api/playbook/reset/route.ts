import { requireSession } from "@/lib/auth-guard";
import { resetPlaybook } from "@/lib/playbook/store";
import { playbookError } from "../errors";

export async function POST() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  try {
    await resetPlaybook(g.session.user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return playbookError(e);
  }
}
