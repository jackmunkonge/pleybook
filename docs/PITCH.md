# Pitch

Every number below comes from `eval/results/2026-11-18T08-52-52-318Z.json` (model `gemini-3.8-flash`, 12 synthetic
contracts, 45 hand-labelled deviations). Rerun `npm run eval` and update this file if you change the pipeline.

## One line

Pleybook checks every clause of a contract against your negotiation playbook and proves its quotes: each cited passage
is verified against the clause text by code, not by another model.

## Short version

Asking a model to "summarize this contract and flag the risks" sounds reasonable and fails quietly. It doesn't know
your playbook, it can't tell you a clause is *missing*, and its quotes may be invented. Pleybook splits the contract
into clauses, retrieves the matching playbook rule for each (vector plus lexical search, with a rerank when unsure),
asks the model for a structured verdict, and then verifies every quote deterministically. Anything unverifiable is
flagged and downgraded.

On a hand-labelled set of 12 synthetic contracts, a naive baseline (fixed chunks, vector-only, no validation) found
**31%** of the 45 labelled deviations and tied **18%** to the right rule. The full pipeline found **98%** and tied
**96%** to the right rule, with a false-positive rate of **2%** against the baseline's 11%. Quoted text appeared in
the clause **100%** of the time for both, so the gain comes from retrieval and structure rather than from
quote checking. It also found **99%** of the playbook topics a contract never addresses (precision 98%), which the
baseline cannot do at all.

## Honest caveats (say these out loud)

- The contracts are synthetic and the answer key was written by the author, so this shows relative behaviour on one
  set, not real-world accuracy.
- Faithfulness (92% for both) was judged by the same model on 12 sampled findings, so it is indicative only.
- The naive baseline's recall moved between 31% and 38% across runs; the pipeline was steadier.
- The pipeline missed 2 of 45: one wrong retrieval and one wrong rule. They were different one-offs, so no tuning was
  done against them.
- Text PDFs and DOCX only, English only, one rule per clause.

## Talking points

- **Verifiable by construction.** Quote checking is plain code (exact, normalized, then fuzzy at 0.95).
- **Cheap to run.** Clauses with no relevant rule never reach the model; the rest go in batches of eight.
- **Resilient.** Gemini, then Groq, then OpenRouter; and if every provider is down the sample contract still works
  from saved embeddings and a saved review, clearly badged "cached".
- **Measured.** The eval runs the same code the app ships, so the scores describe the real pipeline.
