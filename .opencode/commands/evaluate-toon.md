---
description: Score an AI instruction file against the communication effectiveness rubric and return weighted recommendations
---
You are evaluating an AI instruction file. The file to evaluate is: $ARGUMENTS

Read the file at that path using your file-reading tool, then score it using the rubric below.

## Scoring principles

Format is not the goal. Clear, efficient communication of constraints and facts to an LLM is the goal.
TOON, markdown, and hybrid formats can all score 5/5 if they communicate well.
A well-written markdown document can outperform a poorly structured TOON file.
Structure and order matter more than syntax choice.
Token efficiency matters, but never at the cost of comprehension.

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
    communication_effectiveness:
      weight: 0.30
      question: does_every_entry_clearly_and_unambiguously_change_a_concrete_llm_behaviour
      note: "format-neutral — TOON, markdown, and hybrid score equally if they communicate well"
      anchors:
        5: "every constraint uses must/never/always or equivalent hard language; every fact is non-obvious; no entry could be misread as advisory"
        4: "most entries are hard constraints or non-obvious facts; 1-2 use soft language like 'prefer' or 'try to'"
        3: "roughly half are hard constraints; half are suggestions, descriptions, or common knowledge"
        2: "most entries are soft suggestions or restatements of what the LLM already knows"
        1: "no entries that would change LLM behaviour; entirely advisory or redundant"

    structure_and_order:
      weight: 0.25
      question: are_constraints_ordered_by_priority_and_structured_for_minimum_parsing_effort
      note: "hard constraints and pre-flight checks must appear before capabilities; decision matrices beat prose for binary conditions"
      anchors:
        5: "hard constraints appear first; decision matrices used for binary condition sets; capabilities follow constraints; no prose where a table or list works"
        4: "mostly correct order; 1-2 constraints buried after capabilities or in prose that should be a table"
        3: "mixed order; some constraints after capabilities; some binary conditions in prose instead of table"
        2: "capabilities described before constraints; binary conditions in prose throughout; no decision matrices"
        1: "structure actively misleads — capabilities first, constraints last or absent"

    exactness:
      weight: 0.20
      question: are_commands_runnable_verbatim_and_rules_hard_constraints
      anchors:
        5: "all commands copy-pasteable; all rules use must/never/always; required output formats shown as code blocks"
        4: "nearly all exact; 1-2 commands have unexplained placeholders"
        3: "mix of exact and approximate; some rules say 'prefer' or 'try to'"
        2: "most commands are descriptions not invocations; rules are mostly suggestions"
        1: "no runnable commands; no hard constraints"

    token_efficiency:
      weight: 0.15
      question: is_information_expressed_without_unnecessary_tokens_given_the_format_chosen
      note: "efficiency is judged within the chosen format — a well-structured markdown file can score 5; verbosity within any format scores low"
      anchors:
        5: "no prose where key:value or a table works; no decorative separators; no redundant headers; under 600 tokens"
        4: "minor verbosity; 1-2 decorative elements; under 900 tokens"
        3: "some unnecessary prose or decorative markup; 900-1500 tokens"
        2: "significant verbosity; decorative separators throughout; 1500-2500 tokens"
        1: "verbose prose; repeated headers; decorative markup throughout; over 2500 tokens"

    non_redundancy:
      weight: 0.10
      question: does_it_omit_what_the_llm_can_see_or_already_knows
      anchors:
        5: "zero entries visible from file tree or common LLM knowledge"
        4: "1-2 borderline entries that add marginal value"
        3: "several entries restate visible structure or generic best practices"
        2: "majority of entries duplicate file tree or LLM prior knowledge"
        1: "file is entirely redundant with what the LLM already knows"

  format_detection:
    pure_toon:      "file contains only TOON syntax (no markdown headers or bullets)"
    hybrid:         "markdown structure with TOON-style key:value rules — often the best choice"
    pure_markdown:  "file uses only markdown (headers, bullets, prose, tables)"
    other:          "YAML, JSON, plain text, or mixed"

  format_guidance:
    decision_matrices:  "use markdown table — highest LLM attention, best token efficiency for binary condition sets (research: +40% accuracy vs prose)"
    key_value_config:   "use TOON key:value — no table overhead; clean for sparse or long-value data"
    ordered_steps:      "use numbered list — sequence signal matters more than matrix structure"
    hard_constraints:   "use must/never/always in plain text — semantic weight beats bold/italic (bold adds tokens with negligible emphasis signal)"
    section_boundaries: "use ## heading when file has 2+ distinct sections — structural signal worth 2 tokens"
    decorative_markup:  "never use --- separators, **bold**, or _italic_ for emphasis — negligible signal, wasted tokens; use word choice instead"

  composite: "sum(score_i * weight_i) rounded to 2 decimal places, scale 1-5"
```

1. Detect the format using `format_detection` above and state it explicitly.
2. Score each dimension 1-5 using the anchors as your guide. For subjective dimensions cite 1-2 specific entries as evidence.
3. Compute the composite score: multiply each score by its weight and sum.
4. Output the result in this structure:

```
File: <path>
Format: <detected format>

Scores
──────
Communication effectiveness  (×0.30):  N/5
Structure and order          (×0.25):  N/5
Exactness                    (×0.20):  N/5
Token efficiency             (×0.15):  N/5
Non-redundancy               (×0.10):  N/5
──────────────────────────────────────────
Composite:                           N.NN/5

Format note: <one sentence on whether the format choice serves or hinders communication>

Recommendations
───────────────
[ordered by weighted impact — highest first]
1. [dimension] <specific change> — before/after example where applicable
2. ...
```

Keep recommendations concrete. For structure/order issues show what should move where. For token efficiency issues show a before/after. For communication effectiveness issues quote the specific entry that scored low and explain why it reads as advisory rather than directive.
