#!/usr/bin/env bun
/**
 * Demonstrates the heuristic scorer against four sample files:
 *   1. fixtures/AGENTS-toon.md       — well-formed TOON (expected: high scores)
 *   2. fixtures/AGENTS-markdown.md   — equivalent Markdown (expected: low efficiency)
 *   3. A synthetic "bad" TOON file   — deep nesting, verbose keys, over 500 tokens
 *   4. A synthetic hybrid file       — TOON fence inside Markdown prose
 *
 * Run: bun scripts/demo-evaluate.ts
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { score, formatAnnotation, type HeuristicScore } from "../src/heuristic.ts"

const FIXTURES = resolve(import.meta.dir, "../fixtures")
const LINE = "─".repeat(66)

// ── synthetic fixtures ────────────────────────────────────────────────────────

const BAD_TOON = `\
# This file has problems
this_is_a_very_long_and_verbose_key_name: value
another_extremely_verbose_key_name: value
deeply:
  nested:
    structure:
      that:
        goes:
          too_far: yes
rules:
  - never use any
  - always write tests
  - prefer composition
  - use descriptive names
  - write clean code
  - avoid magic numbers
  - document everything
${"padding_key_" + "x".repeat(10) + ": " + "filler_value ".repeat(30) + "\n"}
`

const HYBRID = `\
# Agent Rules

Some introductory prose that explains what this file is for and provides
context that the LLM probably already knows from reading the codebase.

\`\`\`toon
cmds:
  test: "bun test"
  build: "bun tsc"
\`\`\`

## Additional Notes

- Always write tests
- Use TypeScript
- Follow the existing style
`

// ── runner ────────────────────────────────────────────────────────────────────

type Sample = { label: string; body: string }

const samples: Sample[] = [
  {
    label: "fixtures/AGENTS-toon.md  (well-formed TOON)",
    body: readFileSync(resolve(FIXTURES, "AGENTS-toon.md"), "utf8"),
  },
  {
    label: "fixtures/AGENTS-markdown.md  (equivalent Markdown)",
    body: readFileSync(resolve(FIXTURES, "AGENTS-markdown.md"), "utf8"),
  },
  {
    label: "synthetic: bad TOON  (deep nesting, verbose keys, over-budget)",
    body: BAD_TOON,
  },
  {
    label: "synthetic: hybrid  (TOON fence inside Markdown prose)",
    body: HYBRID,
  },
]

function bar(n: number, max = 5, width = 20): string {
  const filled = Math.round((n / max) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

function renderScore(s: HeuristicScore) {
  console.log(`  Format : ${s.format}`)
  console.log(`  Tokens : ~${s.tokens}  (budget: 500)`)
  console.log()
  console.log(`  token_efficiency   ${bar(s.tokenEfficiency)}  ${s.tokenEfficiency}/5`)
  console.log(`  structural_quality ${bar(s.structuralQuality)}  ${s.structuralQuality}/5`)
  console.log()
  if (s.warnings.length === 0) {
    console.log("  warnings : none")
  } else {
    console.log("  warnings :")
    for (const w of s.warnings) console.log(`    · ${w}`)
  }
  console.log()
  console.log("  system-prompt annotation (what the AI sees):")
  for (const line of formatAnnotation(s).split("\n")) {
    console.log(`    ${line}`)
  }
}

console.log()
console.log("Heuristic scorer demo — token_efficiency and structural_quality")
console.log("(Subjective dimensions require /evaluate-toon for LLM assessment)")
console.log(LINE)

for (const { label, body } of samples) {
  console.log()
  console.log(`▶ ${label}`)
  console.log()
  renderScore(score(body))
  console.log(LINE)
}
console.log()
