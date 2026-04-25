---
description: Score an AI instruction file against the TOON rubric and return weighted recommendations
---
You are evaluating an AI instruction file. The file to evaluate is: $ARGUMENTS

Read the file at that path using your file-reading tool, then score it using the rubric below.

```toon
rubric:
  scale: 1-5
  scale_anchors:
    5: exemplary_nothing_to_improve
    4: good_minor_improvements_possible
    3: adequate_clear_improvements_available
    2: weak_significant_problems
    1: poor_actively_harms_effectiveness

  dimensions:
    actionability:
      weight: 0.25
      question: does_every_entry_demonstrably_change_a_concrete_llm_behaviour
      anchors:
        5: "every entry is a specific runnable command, hard constraint, or fact the LLM would otherwise get wrong"
        4: "most entries are actionable; 1-2 are vague suggestions"
        3: "roughly half actionable; half are generic advice or soft suggestions"
        2: "most entries are suggestions, descriptions, or restatements of common knowledge"
        1: "file contains no entries that would change LLM behaviour"

    exactness:
      weight: 0.20
      question: are_commands_runnable_verbatim_and_rules_hard_constraints
      anchors:
        5: "all commands copy-pasteable; all rules use must/never/always"
        4: "nearly all exact; 1-2 commands have placeholders without explanation"
        3: "mix of exact and approximate; some rules say 'prefer' or 'try to'"
        2: "most commands are descriptions not invocations; rules are mostly suggestions"
        1: "no runnable commands; no hard constraints"

    token_efficiency:
      weight: 0.20
      question: is_information_expressed_in_the_fewest_tokens_the_format_allows
      anchors:
        5: "TOON throughout; pipe lists; no prose where key:value works; under 500 tokens"
        4: "mostly TOON or compact; minor prose; under 700 tokens"
        3: "hybrid or Markdown with some compaction; 700-1200 tokens"
        2: "full Markdown prose; bullets instead of pipes; 1200-2000 tokens"
        1: "verbose prose; repeated headers; over 2000 tokens"

    structural_quality:
      weight: 0.15
      question: is_structure_flat_clear_and_appropriately_nested
      anchors:
        5: "nesting ≤3 levels; short keys; arrays use tabular syntax; 2-space indent"
        4: "mostly flat; 1-2 deep chains that could be flattened"
        3: "some nesting >3 levels or verbose keys; no tabular arrays"
        2: "frequent deep nesting; long keys; no structural compaction"
        1: "structure actively obscures meaning or is inconsistent throughout"

    non_redundancy:
      weight: 0.15
      question: does_it_omit_what_the_llm_can_see_or_already_knows
      anchors:
        5: "zero entries visible from file tree or common LLM knowledge"
        4: "1-2 borderline entries that add marginal value"
        3: "several entries restate visible structure or generic best practices"
        2: "majority of entries duplicate file tree or LLM prior knowledge"
        1: "file is entirely redundant with what the LLM already knows"

    completeness:
      weight: 0.05
      question: does_it_capture_facts_the_llm_would_otherwise_get_wrong
      anchors:
        5: "covers all non-obvious commands, constraints, and architecture facts"
        4: "covers most; 1-2 obvious gaps"
        3: "covers basics; missing several non-obvious facts"
        2: "sparse; LLM would make frequent wrong assumptions"
        1: "so incomplete it provides no useful guidance"

  format_detection:
    pure_toon: "file contains only TOON syntax (no markdown headers or bullets)"
    hybrid: "file contains a toon fenced block plus surrounding markdown"
    pure_markdown: "file uses only markdown (headers, bullets, prose)"
    other: "YAML, JSON, plain text, or mixed"

  composite: "sum(score_i * weight_i) rounded to 2 decimal places, scale 1-5"
```

1. Detect the format using `format_detection` above and state it explicitly.
2. Score each dimension 1–5 using the anchors as your guide. For subjective dimensions (actionability, completeness) cite 1–2 specific entries as evidence for your score.
3. Compute the composite score: multiply each score by its weight and sum.
4. Output the result in this structure:

```
File: <path>
Format: <detected format>

Scores
──────
Actionability      (×0.25):  N/5
Exactness          (×0.20):  N/5
Token efficiency   (×0.20):  N/5
Structural quality (×0.15):  N/5
Non-redundancy     (×0.15):  N/5
Completeness       (×0.05):  N/5
──────────────────────────────────
Composite:                 N.NN/5

Format note: <one sentence on what the format choice costs or saves in tokens>

Recommendations
───────────────
[ordered by weighted impact — highest first]
1. [dimension] <specific change> — example before/after if applicable
2. ...
```

Keep recommendations concrete and actionable. For token efficiency and structural quality issues, always show a before/after example. For actionability and exactness issues, quote the specific entry that scored low.
