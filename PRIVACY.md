# ClauseAI — data handling & privacy

This document describes how **ClauseAI** (contract-negotiator) handles uploaded contract documents as of the current codebase. It is not legal advice.

## Summary

| Data | Stored on our server? | Sent to third parties? | In application logs? |
|------|----------------------|-------------------------|----------------------|
| Uploaded PDF bytes | No (in-memory only for the request) | Yes — text/clauses sent to **Google Gemini API** for analysis | No intentional logging of document content |
| Analysis JSON response | No persistence | Returned from Gemini to the client | Errors log messages only, not full documents |

## Request lifecycle

1. The client uploads two PDFs to `POST /api/negotiate`.
2. The Bun server reads files into memory (`Buffer`), extracts text in memory, segments clauses, and (for the default pipeline) computes embeddings and calls Gemini for conflict analysis.
3. The JSON result is returned to the client. **No database, cache, or disk write** of contract content is performed in the normal path.
4. When the request ends, buffers are eligible for garbage collection; we do not retain uploads.

## Third party: Google Gemini API

Contract text (clause segments and paired clauses in prompts) is transmitted to Google’s Gemini API for inference and embeddings.

**Training / product improvement** (verify on [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)):

- **Unpaid Services** (typical free-tier / AI Studio usage without Cloud Billing): Google **may** use prompts and responses to improve products, subject to the terms in force for your account.
- **Paid Services** (including Gemini API usage under an activated **Cloud Billing** account, including free quota on that billing account): Google **does not** use prompts or responses to improve Google products; processing is under the data processing terms referenced in the API terms.

**Retention on Google’s side**:

- Paid Services: Google states prompts/responses may be **logged for a limited period** for abuse/policy enforcement and required disclosures (not indefinite storage for your application data). See [Zero data retention (ZDR)](https://ai.google.dev/gemini-api/docs/zdr) for enterprise options that further restrict logging.
- Unpaid Services: governed by the Unpaid Services section of the same terms (do not assume zero retention).

ClauseAI does **not** enable Grounding with Google Search; features that store prompts for 30 days do not apply unless added later.

**Embeddings**: Clause text is sent to Google’s embedding model (`gemini-embedding-001`) when using the retrieval pipeline.

## Application logging

- Negotiation failures log generic errors (`Negotiation error:`) without attaching PDF or clause text.
- Malformed model JSON triggers a generic client error; **full model output is not logged** (to avoid leaking contract text into log sinks).

## Temporary files

PDF parsing uses in-memory buffers only. A unit test in `backend/tests/privacy.test.ts` asserts that parsing does not create files in a temporary directory during extraction.

## Operator responsibilities

- Configure **`GEMINI_API_KEY`** via environment variables; never commit keys.
- Choose a Gemini API billing/tier that matches your compliance needs (Paid vs Unpaid data use).
- Deploy behind HTTPS; restrict CORS via `FRONTEND_URL` in production.
- Do not submit highly confidential material unless your Google agreement and organizational policy allow it.

## Changes

Update this file when the pipeline gains persistence, caching, logging, or new third-party services.
