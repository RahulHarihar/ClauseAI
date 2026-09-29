# ClauseAI evaluation harness

Quantitative regression checks for conflict detection. **Do not skip this when changing prompts, models, or retrieval** — run eval before and after and compare `eval/results_history.csv`.

## Dataset (small, synthetic)

The repo ships **5 hand-labeled synthetic pairs** under `eval/dataset/pair_*/`. They are not real contracts and do not cover all clause types; treat metrics as directional, not production guarantees.

Each pair includes:

- `doc_a.pdf` / `doc_b.pdf` — synthetic text PDFs
- `manifest.json` — ground-truth conflicts with `category`, excerpts, and descriptions

### Add a new labeled pair

1. Create `eval/dataset/pair_XXX/` with PDFs (or regenerate via `bun eval/scripts/generateSyntheticPdfs.ts` as a template).
2. Add `manifest.json`:

```json
{
  "id": "pair_006",
  "doc_a_path": "eval/dataset/pair_006/doc_a.pdf",
  "doc_b_path": "eval/dataset/pair_006/doc_b.pdf",
  "ground_truth_conflicts": [
    {
      "category": "payment_timeline",
      "clause_a_excerpt": "short quote from A",
      "clause_b_excerpt": "short quote from B",
      "description": "What differs and why it matters"
    }
  ]
}
```

3. Use **short excerpts** that appear verbatim (or near-verbatim) in the PDF text so fuzzy matching can align model output with labels.

Regenerate all synthetic PDFs:

```bash
bun eval/scripts/generateSyntheticPdfs.ts
```

## Run eval

From the repo root (requires `backend/.env` with `GEMINI_API_KEY`):

```bash
bun eval/runner.ts
```

Options:

| Flag | Purpose |
|------|---------|
| `--model gemini-3.5-flash` | Evaluate a **single** model (no fallback chain) |
| `--mode full_document` | Legacy-style: all clauses in one prompt (baseline) |
| `--mode retrieval` | Default: clause segmentation + embedding retrieval + batched pair analysis |
| `--dry-run` | Load dataset only, no API calls |

Examples:

```bash
# Baseline (full-document prompt)
bun eval/runner.ts --mode full_document

# Retrieval pipeline (current production path)
bun eval/runner.ts --mode retrieval

# Compare models standalone
bun eval/runner.ts --model gemini-3.5-flash --mode retrieval
```

Each run prints a precision/recall table and **appends one row** to `eval/results_history.csv` with timestamp, model, prompt hash, mode, and aggregate metrics.

**Note:** `full_document` mode on long pairs (e.g. `pair_005`) can be slow or hit API timeouts; the service treats timeouts like capacity errors and advances the model fallback chain. Prefer `--mode retrieval` for production-like runs, or `--model <name>` to test one model at a time.

## Metrics

Matching uses **fuzzy overlap** on clause excerpts (token Jaccard + longest-common-substring ratio), not exact string equality. A detection is a true positive if it aligns with one ground-truth row above the threshold; unmatched detections are false positives; missed labels are false negatives.

- **Precision** — share of reported conflicts that match a label  
- **Recall** — share of labeled conflicts that were found  
- **F1** — harmonic mean of precision and recall  

Per-category recall in the console is based on ground-truth categories (not model-assigned topics).

## Interpreting regressions

1. Note the `prompt_hash` column — it changes when prompt templates in `geminiService.ts` change.  
2. Compare rows with the same `pipeline_mode` and `model`.  
3. If retrieval mode regresses vs `full_document` on this tiny set, investigate retrieval pairing or batch prompts before shipping.
