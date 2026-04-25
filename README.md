# opencode-toon-config-plugin

An [OpenCode](https://opencode.ai) plugin that loads `AGENTS.toon` as your project rules file.

[TOON](https://github.com/toon-format/spec) (Token-Oriented Object Notation) is a compact,
indentation-based format that encodes the same information as Markdown in fewer tokens. Because
OpenCode injects your rules file into the system prompt on every LLM turn, a smaller file
saves tokens on every turn, not just once per session.

## Why TOON instead of Markdown?

Measured with the cl100k_base tokenizer (GPT-4 / Claude-compatible) on equivalent rule sets:

| Metric                           | TOON  | Markdown | Difference |
| -------------------------------- | ----- | -------- | ---------- |
| File size                        | 3,255 B | 4,204 B | -22%     |
| Tokens per turn (injected)       | 922   | 1,087    | -15%       |
| Tokens saved per 20-turn session |       |          | ~3,300     |

The saving compounds with session length. A 20-turn session with a 1,087-token Markdown rules
file costs 21,740 input tokens from the rules file alone. The TOON equivalent costs 18,440,
roughly $0.01 saved per session on Claude Sonnet.

TOON is also faster to write and easier to maintain: no `##` headers, no bullet prefixes, no
repeated prose.

## What AGENTS.toon looks like

```toon
rules: "never_redirect_stderr|use_just_commands|parse_toon_format"
cmds:
  fast: "just py-test-fast"
  unit: "just py-test-unit"
  single: "just py-test-run nodeid"
  fix: "just py-fix"
workspace:
  rule: "never_prefix_commands_with_cd_workspace_root"
project:
  architecture: "hexagonal_domain_driven_design"
  source_of_record: "filesystem"
layers:
  domain: "pure_business_logic|no_external_deps"
  services: "orchestration|domain_ports_only"
  adapters: "external_integrations"
style:
  functions: "<=20_lines|verb_noun_naming"
  protocols: "typing.Protocol_only|no_abc_ABC"
testing:
  fakes: "preferred_over_mocks"
  tdd: "write_failing_test_first"
```

See the [TOON specification](https://github.com/toon-format/spec) for the full format reference.

## How the plugin works

On startup the plugin locates `AGENTS.toon` in your project directory (or worktree root) and
reads it into memory. On every subsequent LLM turn it checks whether the file has changed using
a two-stage strategy:

1. `stat` check: compares `mtime` and `size` against cached values. One syscall (~1 us).
   No file read when the file has not changed.
2. Hash check: only if the stat changed, reads the file and computes a SHA-256 hash. If
   the hash matches (e.g. a no-op save), the in-memory content is kept and only the stat
   metadata is updated.

The file is read from disk only when its content actually changes. The system prompt is always
current.

## Installation

### GitHub

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["github:mmynsted/opencode-toon-config-plugin"]
}
```

OpenCode installs the plugin automatically on first run.

### Local path (development)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./path/to/opencode-toon-config-plugin"]
}
```

Then create an `AGENTS.toon` file in your project root.

## File lookup order

The plugin searches for `AGENTS.toon` in this order:

1. The current working directory (`directory`)
2. The worktree root (`worktree`)

The first match wins. If no `AGENTS.toon` is found the plugin logs `no AGENTS.toon found` and
does nothing. OpenCode falls back to its normal `AGENTS.md` / `CLAUDE.md` lookup.

## Coexistence with AGENTS.md

This plugin injects `AGENTS.toon` via the `experimental.chat.system.transform` hook.
OpenCode's built-in `AGENTS.md` loading runs separately and is not disabled. If you have both
files, both will be injected. Remove or rename your `AGENTS.md` once you have migrated to
avoid duplication.

## Logging

The plugin writes concise status lines to stderr so you can confirm it is working:

```
INFO  2026-04-24T10:00:00 +0ms service=agents-toon loaded: /your/project/AGENTS.toon 3255B ~838 tok
INFO  2026-04-24T10:01:05 +65003ms service=agents-toon reload: 3312B ~843 tok
INFO  2026-04-24T10:00:00 +0ms service=agents-toon no AGENTS.toon found
```

Token counts are estimates (`~N tok`) based on the cl100k_base average of ~4 characters per
token.

## Writing a useful AGENTS.toon

### What to include

Include only what the LLM cannot discover by reading your files:

| Category                  | Examples                                                        |
| ------------------------- | --------------------------------------------------------------- |
| Exact commands            | `just py-test-fast`, `bun tsc`, `make lint`                     |
| Hard rules                | things the LLM must never do, or must always do                 |
| Architecture constraints  | layer boundaries, where adapters live, what is off-limits       |
| Non-obvious conventions   | why something is structured the way it is                       |
| Failure playbook          | what to check when tests fail, what errors mean                 |
| Key file paths            | config entry point, constants file, wiring location             |

### What to leave out

- Anything visible from the file tree (the LLM reads it)
- Generic best practices it already knows (`use descriptive names`, `write tests`)
- Prose explanations that could be a `key: value`
- Duplicate content already in `AGENTS.md` or `opencode.json` `instructions`

### Format tips

Use pipe `|` for lists, which is far denser than bullets:

```toon
rules: "never_redirect_stderr|use_just_commands|no_direct_pytest"
```

Use nested keys for groups instead of `##` headers:

```toon
testing:
  fast: "just py-test-fast"
  single: "just py-test-run nodeid"
  mark: "@pytest.mark.integration"
```

Quote only when necessary. Values with spaces, colons, or special characters need quotes;
bare words do not:

```toon
purpose: "real-time shipment tracking"
mode: primary
```

Avoid multiline block strings. They cost tokens and obscure structure:

```toon
# avoid
notes: |
  This project uses hexagonal architecture.
  Domain logic lives in src/domain.

# prefer
arch: "hexagonal|domain=src/domain|no_external_deps_in_domain"
```

Keep nesting shallow. More than 3 levels is a signal to flatten or split into sibling keys.
Use tabular syntax for arrays even when nested.

Keep the file under ~500 tokens (~2,000 characters). Beyond that, split into focused files and
reference them via the `instructions` field in `opencode.json`:

```json
{
  "instructions": ["AGENTS.toon", "docs/architecture.md"]
}
```

### Pre-commit checklist

- [ ] Every command is exact and runnable, not a description
- [ ] Every rule is a constraint, not a suggestion
- [ ] No entry duplicates what the LLM can see in the file tree
- [ ] No generic advice the LLM already knows
- [ ] File is under 500 tokens (`just bench` to measure)
- [ ] Pipe-separated lists used instead of bullet points where possible
- [ ] Nested keys used instead of section headers
- [ ] Nesting depth is 3 levels or fewer

### Annotated minimal example

```toon
# exact recipes, not descriptions
cmds:
  test: "just py-test-fast"
  fix: "just py-fix"
  single: "just py-test-run nodeid"

# things the LLM would otherwise do wrong
rules: "never_redirect_stderr|never_call_pytest_directly|never_cd_to_workspace_root"

# what to do when tests fail
on_fail: "check failed_tests[].nodeid -> just py-test-run nodeid"

# constraints not visible from filenames
arch:
  layers: "domain|ports|services|adapters|cli"
  rule: "domain_has_no_external_deps"
  wiring: "src/myapp/cli/_compositor.py"

# non-obvious entry points
paths:
  config: "src/myapp/config.py"
  constants: "src/myapp/domain/constants.py"
```

## Evaluating instruction files

The plugin ships two complementary evaluation features: an on-demand command for LLM-based
scoring of any AI instruction file, and an optional ambient heuristic that annotates the system
prompt with structural metrics on every turn.

### `/evaluate-toon` command

Scores any AI instruction file (`AGENTS.toon`, `AGENTS.md`, a Markdown command file, or any
other format) against a six-dimension weighted rubric and returns a score with prioritised
recommendations.

#### Rubric

| Dimension          | Weight | What it measures                                                   |
| ------------------ | ------ | ------------------------------------------------------------------ |
| Actionability      | 25%    | Does every entry demonstrably change a concrete LLM behaviour?     |
| Exactness          | 20%    | Are commands runnable verbatim? Are rules hard constraints?        |
| Token efficiency   | 20%    | Is information expressed in the fewest tokens the format allows?   |
| Structural quality | 15%    | Is structure flat, clear, and appropriately nested (3 levels max)? |
| Non-redundancy     | 15%    | Does it omit what the LLM can see or already knows?                |
| Completeness       | 5%     | Does it capture facts the LLM would otherwise get wrong?           |

Each dimension is scored 1-5 with defined anchors. The composite is the weighted sum on the
same 1-5 scale. Format is detected automatically (pure TOON, hybrid, pure Markdown, or other)
and affects the token efficiency and structural quality scores accordingly.

#### Installation

The command file ships with the package at `commands/evaluate-toon.md`. Copy it to your
project's `.opencode/commands/` directory:

```sh
# GitHub / auto-install
mkdir -p .opencode/commands
cp ~/.cache/opencode/packages/github:mmynsted/opencode-toon-config-plugin/node_modules/opencode-toon-config-plugin/commands/evaluate-toon.md .opencode/commands/
```

#### Use

```
/evaluate-toon AGENTS.toon
/evaluate-toon AGENTS.md
/evaluate-toon .opencode/commands/my-command.md
```

Example output:

```
File: AGENTS.toon
Format: toon

Scores
------
Actionability      (x0.25):  4/5
Exactness          (x0.20):  5/5
Token efficiency   (x0.20):  5/5
Structural quality (x0.15):  4/5
Non-redundancy     (x0.15):  5/5
Completeness       (x0.05):  3/5
----------------------------------
Composite:                 4.55/5

Format note: Pure TOON saves ~165 tokens per turn vs the Markdown equivalent.

Recommendations
---------------
1. [completeness] Add failure playbook - what to check when tests fail
2. [structural_quality] Flatten: report.meta.source.system -> report.source_system
```

#### Adjusting the weights

The rubric and weights live entirely inside the TOON fenced block in `evaluate-toon.md`. Edit
the `weight:` values under each dimension. Weights do not need to sum to 1.0; only relative
values matter. Your edited copy is local to your project and version-controlled with it.

```toon
# example: prioritise token efficiency over actionability
dimensions:
  actionability:
    weight: 0.15
  token_efficiency:
    weight: 0.35
```

### `evaluate` plugin option

When enabled, the plugin scores `AGENTS.toon` structurally on every load and reload and injects
a compact annotation into the system prompt. The AI sees it on every turn and can proactively
surface issues.

This is a heuristic scorer. It measures only the two objective dimensions that static analysis
can assess without an LLM: token efficiency and structural quality. For the full six-dimension
assessment, use `/evaluate-toon`.

#### Enabling

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["github:mmynsted/opencode-toon-config-plugin", { "evaluate": true }]]
}
```

#### What the AI sees

```
[toon-eval] format=toon tokens=~230
  token_efficiency=5/5 structural_quality=4/5
  warnings: nesting_depth_4_exceeds_3
```

The annotation is three lines at most and updates automatically whenever `AGENTS.toon` changes.
It adds approximately 20-35 tokens per turn. Disable it once your file is clean.

#### Stderr output

```
INFO  2026-04-25T10:00:00 +0ms service=agents-toon loaded: /project/AGENTS.toon 922B ~230 tok evaluate=on
INFO  2026-04-25T10:00:00 +0ms service=agents-toon eval: [toon-eval] format=toon tokens=~230
```

## Development

The project uses [just](https://just.systems) as a task runner. Run `just` with no arguments to
list all recipes.

### Recipes

| Recipe               | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `just build`         | Compile TypeScript to `dist/`                             |
| `just check`         | Type-check without emitting output                        |
| `just clean`         | Remove `dist/` and rebuild from scratch                   |
| `just test`          | Run the full unit test suite (plugin + heuristic)         |
| `just test-heuristic`| Run only the heuristic scorer tests                       |
| `just test-plugin`   | Run only the plugin integration tests                     |
| `just ci`            | Type-check then run all tests (CI equivalent)             |
| `just demo`          | Print heuristic scores for good, bad, and hybrid examples |
| `just bench`         | Token and timing benchmark: TOON vs Markdown fixtures     |

### Test files

| File                        | Covers                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/plugin.test.ts`      | File location (directory vs worktree fallback, preference ordering), injected content format, two-stage cache behaviour, system array entry count, `evaluate` option behaviour |
| `tests/heuristic.test.ts`   | Format detection, token efficiency scoring, structural quality scoring (nesting depth, verbose keys, format penalty), warning generation, `formatAnnotation` output shape      |

### Scripts

| Script                       | Recipe        | What it does                                                                                                                                                                    |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/demo-evaluate.ts`   | `just demo`   | Prints heuristic scorer output for four cases: the TOON fixture, the Markdown fixture, a synthetic bad TOON file (deep nesting, verbose keys), and a synthetic hybrid           |
| `scripts/compare-agents.ts`  | `just bench`  | Token and timing benchmark comparing `fixtures/AGENTS-toon.md` vs `fixtures/AGENTS-markdown.md`. Reports file size, token count, per-session cost, and disk read timing (median/mean/p95 over 500 runs) |

## License

MIT - Copyright (c) 2026 Growing Liberty LLC
