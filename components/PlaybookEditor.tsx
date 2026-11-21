"use client";

import { MAX_RULES, type PlaybookRuleView, type RuleInput } from "@/lib/playbook/rules";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "./Sheet";

type Draft = { name: string; category: string; text: string; preferred: string; fallback: string; variants: string };
const EMPTY: Draft = { name: "", category: "", text: "", preferred: "", fallback: "", variants: "" };
const NEW = "__new__";

const toDraft = (r: PlaybookRuleView): Draft => ({ ...r, variants: r.variants.join("\n") });
const toInput = (d: Draft): RuleInput => ({
  name: d.name.trim(),
  category: d.category.trim(),
  text: d.text.trim(),
  preferred: d.preferred.trim(),
  fallback: d.fallback.trim(),
  variants: d.variants.split("\n").map((v) => v.trim()).filter(Boolean),
});

const btn = "rounded-[10px] px-4 py-2.5 text-sm leading-5 font-medium disabled:opacity-50";
const primary = `${btn} bg-brand-solid text-brand-on-solid hover:opacity-90`;
const secondary = `${btn} border border-border-strong bg-bg-surface hover:bg-bg-canvas`;
const ghost = `${btn} text-text-secondary hover:bg-bg-subtle hover:text-text-primary`;
const deleteBtn = `${btn} border border-risk-high-border bg-risk-high-bg text-risk-high-fg hover:bg-risk-high-subtle hover:text-risk-high-fg`;

const inputCls =
  "w-full rounded-lg border border-border-strong bg-bg-canvas px-3 py-2.5 text-base leading-6 lg:text-[15px] text-text-primary placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-brand-text";

function Field({ label, value, onChange, rows, className = "" }: { label: string; value: string; onChange: (v: string) => void; rows?: number; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm leading-5 text-text-secondary ${className}`}>
      {label}
      {rows ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={`${inputCls} resize-y`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </label>
  );
}

export function PlaybookEditor({ initialRules, initialCustom }: { initialRules: PlaybookRuleView[]; initialCustom: boolean }) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [custom, setCustom] = useState(initialCustom);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function refresh() {
    const res = await fetch("/api/playbook");
    if (!res.ok) throw new Error("Could not reload the playbook");
    const data = await res.json();
    setRules(data.rules);
    setCustom(data.custom);
    router.refresh();
  }

  async function call(label: string, url: string, init: RequestInit) {
    setError(null);
    setBusy(label);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const open = (key: string, d: Draft) => {
    setError(null);
    setEditing(key);
    setDraft(d);
  };
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const valid = draft.name.trim() && draft.text.trim();
  const json = (d: Draft) => ({ method: editing === NEW ? "POST" : "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(toInput(d)) });

  const edited = rules.filter((r) => r.status === "edited").length;
  const added = rules.filter((r) => r.status === "added").length;
  const summary = custom
    ? `Your playbook · ${rules.length} rules${edited ? ` · ${edited} edited` : ""}${added ? ` · ${added} added` : ""}`
    : `Default playbook · ${rules.length} rules · edits create your own copy`;

  const footer = (
      <div className="flex flex-wrap items-center gap-3">
        {editing !== NEW && (
          <button
            type="button"
            className={deleteBtn}
            disabled={!!busy}
            onClick={async () => {
              if (editing && (await call("Deleting…", `/api/playbook/${editing}`, { method: "DELETE" }))) setEditing(null);
            }}
          >
            Delete rule
          </button>
        )}
        <div className="flex-1" />
        <button type="button" className={secondary} disabled={!!busy} onClick={() => setEditing(null)}>
          Cancel
        </button>
        <button
          type="button"
          className={primary}
          disabled={!!busy || !valid}
          onClick={async () => {
            const url = editing === NEW ? "/api/playbook" : `/api/playbook/${editing}`;
            if (await call("Saving…", url, json(draft))) setEditing(null);
          }}
        >
          {busy === "Saving…" ? "Saving…" : "Save rule"}
        </button>
      </div>
  );

  const form = (
    <Sheet
      title={editing === NEW ? "New rule" : "Editing rule"}
      onClose={() => !busy && setEditing(null)}
      footer={footer}
    >
     <div className="flex flex-col gap-5">
      <h2 className="text-lg leading-6 font-semibold">{editing === NEW ? "New rule" : "Editing rule"}</h2>
      <div className="flex flex-col gap-4 lg:flex-row">
        <Field label="Name" value={draft.name} onChange={set("name")} className="lg:flex-1" />
        <Field label="Category" value={draft.category} onChange={set("category")} className="lg:w-60" />
      </div>
      <Field label="Rule: what the contract must say" value={draft.text} onChange={set("text")} rows={3} />
      <div className="flex flex-col gap-4 lg:flex-row">
        <Field label="Preferred position" value={draft.preferred} onChange={set("preferred")} rows={3} className="lg:flex-1" />
        <Field label="Fallback position" value={draft.fallback} onChange={set("fallback")} rows={3} className="lg:flex-1" />
      </div>
      <Field label="Example phrasings (one per line)" value={draft.variants} onChange={set("variants")} rows={4} />
     </div>
    </Sheet>
  );

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:gap-6">
        <div className="flex flex-1 flex-col gap-3">
          <p className="font-mono text-[11px] leading-4 font-medium tracking-[0.8px] text-brand-text uppercase">Playbook</p>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.6px]">Your playbook</h1>
          <p className="max-w-[640px] text-[15px] leading-6 text-text-secondary">
            These rules are what every contract is reviewed against. Start from the default set, then edit, add or remove rules to match your own positions.
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" className={secondary} disabled={!custom || !!busy} onClick={() => setConfirmReset(true)}>
            Reset to default
          </button>
          <button type="button" className={primary} disabled={!!busy || rules.length >= MAX_RULES || editing === NEW} onClick={() => open(NEW, EMPTY)}>
            Add rule
          </button>
        </div>
      </header>

      {confirmReset && (
        <Sheet
          title="Reset to default"
          onClose={() => !busy && setConfirmReset(false)}
          footer={
            <div className="flex justify-end gap-3">
              <button type="button" className={secondary} onClick={() => setConfirmReset(false)}>
                Keep my rules
              </button>
              <button
                type="button"
                className={primary}
                disabled={!!busy}
                onClick={async () => {
                  if (await call("Resetting…", "/api/playbook/reset", { method: "POST" })) {
                    setEditing(null);
                    setConfirmReset(false);
                  }
                }}
              >
                {busy === "Resetting…" ? "Resetting…" : "Discard my changes"}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-lg leading-6 font-semibold">Reset to the default playbook?</h2>
            <p className="text-sm leading-5 text-text-secondary">This discards all of your edits, added rules and removals.</p>
          </div>
        </Sheet>
      )}

      <p className="rounded-xl border border-brand-border bg-brand-subtle px-4 py-3 text-sm leading-5 text-brand-text">{summary}</p>
      {error && (
        <p role="alert" className="rounded-xl border border-risk-high-border bg-risk-high-bg px-4 py-3 text-sm leading-5 text-risk-high-fg">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {editing === NEW && <li>{form}</li>}
        {rules.map((r) => (
          <li key={r.key}>
            {editing === r.key ? (
              form
            ) : (
              <div className="flex items-center gap-4 rounded-[14px] border border-border-default bg-bg-surface px-5 py-4 shadow-card">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-[15px] leading-5 font-medium">{r.name}</h3>
                    {r.category && <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-xs leading-4 text-text-secondary">{r.category}</span>}
                    {r.status !== "default" && (
                      <span className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs leading-4 text-brand-text">{r.status === "added" ? "Added" : "Edited"}</span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm leading-5 text-text-secondary">{r.text}</p>
                </div>
                <button type="button" className={ghost} disabled={!!busy} onClick={() => open(r.key, toDraft(r))}>
                  Edit
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
