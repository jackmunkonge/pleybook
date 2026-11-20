import { requireSession } from "@/lib/auth-guard";
import { ruleInput } from "@/lib/playbook/rules";
import { createRule, listPlaybook } from "@/lib/playbook/store";
import { playbookError } from "./errors";

export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  return Response.json(await listPlaybook(g.session.user.id));
}

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const parsed = ruleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid rule" }, { status: 400 });
  try {
    const key = await createRule(g.session.user.id, parsed.data);
    return Response.json({ key }, { status: 201 });
  } catch (e) {
    return playbookError(e);
  }
}
