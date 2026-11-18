# Deploying Pleybook

Target: Vercel (Hobby) + Neon Postgres. Everything runs on free tiers with no credit card. Provider limits change and
differ per account, so check each provider's console rather than trusting figures written down here.

## 1. Prerequisites

- A Neon database (use the **pooled** connection string).
- A Vercel project connected to this repo.
- API keys: Google AI Studio (required: embeddings and the primary LLM). Groq, OpenRouter and Cohere are optional.

## 2. Environment variables

Add these to the Vercel project (and to `.env.local` for local work). `.env.example` is the template.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled connection string |
| `BETTER_AUTH_SECRET` | yes | 32+ chars: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Public URL of the app. **Production URL on Vercel**, `http://localhost:3000` locally |
| `GOOGLE_GENERATIVE_AI_API_KEY` | yes | Embeddings, and the primary LLM |
| `GROQ_API_KEY` | recommended | First fallback LLM |
| `OPENROUTER_API_KEY` | optional | Second fallback LLM |
| `COHERE_API_KEY` | optional | Selective rerank; skipped if unset or rate-limited |
| `PRIMARY_MODEL` | optional | Gemini model ID (default in `lib/llm/providers.ts`) |
| `FALLBACK_MODEL` | optional | Groq model ID |
| `OPENROUTER_MODEL` | optional | OpenRouter model, e.g. `openrouter/free` |
| `EMBED_MODEL` / `EMBED_DIM` | optional | Defaults `gemini-embedding-001` / `768`. **Do not change after clauses are embedded.** |
| `DAILY_REVIEW_LIMIT` | optional | Reviews per user per rolling 24 h (default 5) |

Model IDs change often and some become unavailable to new accounts. If reviews fail, make a one-line call against
each provider to see the real error before assuming a code bug.

## 3. Prepare the production database

Run these from your machine with `DATABASE_URL` pointing at the **production** database:

```bash
npm run db:migrate                                   # tables, vector extension, indexes
npm run playbook:seed                                # load and embed data/playbook.json
npm run user:create -- <username> <password>         # 3-32 chars of a-z 0-9 _ .
```

## 4. Deploy

Push to the branch Vercel builds from. The review route sets `maxDuration = 300`; Hobby functions can run that
long, but check your plan.

## 5. Verify

Logged out:

- `/` redirects to `/login`.
- `curl -i https://<app>/api/reviews` returns `401`.
- `curl -i https://<app>/api/health` returns `200`.

Then log in, run the sample MSA, and click a finding to see the highlight.

## Accounts (invite-only)

There is no public sign-up; the endpoint is disabled. Manage accounts from the CLI against whichever database
`DATABASE_URL` points at:

```bash
npm run user:create -- <username> <password>
npm run user:list
npm run user:delete -- <username>
```

## Notes

- Neon suspends idle databases, so the first request after a quiet period can take a few seconds. The landing page
  pings `/api/health` to wake it.
- The `/eval` page reads `eval/results/*.json`, which ship with the deployment (see `outputFileTracingIncludes` in
  `next.config.ts`). To publish new results, commit the JSON and redeploy.
- Uploaded contracts are stored in Neon and sent to third-party model providers. Use synthetic or public contracts.
