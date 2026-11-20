import { requireSession } from "@/lib/auth-guard";
import { ruleInput } from "@/lib/playbook/rules";
import { deleteRule, updateRule } from "@/lib/playbook/store";
import { playbookError } from "../errors";

type Ctx = { params: Promise<{ key: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const parsed = ruleInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid rule" }, { status: 400 });
  try {
    await updateRule(g.session.user.id, (await params).key, parsed.data);
    return Response.json({ ok: true });
  } catch (e) {
    return playbookError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  try {
    await deleteRule(g.session.user.id, (await params).key);
    return Response.json({ ok: true });
  } catch (e) {
    return playbookError(e);
  }
}
