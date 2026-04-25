#!/usr/bin/env bun
/**
 * Compares fixtures/AGENTS-toon.md vs fixtures/AGENTS-markdown.md
 *
 * Measures:
 *   - File size (bytes)
 *   - Token count using cl100k_base (GPT-4 / tiktoken-compatible)
 *   - Per-turn and per-session token cost (OpenCode injects rules on every turn)
 *   - Disk read time: median/mean/p95 over N runs
 *   - stat-only check time (the plugin's hot path when file is unchanged)
 *
 * Run: bun scripts/compare-agents.ts
 */

import { encode } from "gpt-tokenizer"
import { readFileSync, statSync } from "fs"
import { resolve } from "path"

const FIXTURES = resolve(import.meta.dir, "../fixtures")
const TOON_FILE = resolve(FIXTURES, "AGENTS-toon.md")
const MD_FILE   = resolve(FIXTURES, "AGENTS-markdown.md")
const READ_RUNS = 500
const STAT_RUNS = 2000

// ── helpers ───────────────────────────────────────────────────────────────────

function median(s: number[]) {
  const a = [...s].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
function mean(s: number[]) { return s.reduce((t, v) => t + v, 0) / s.length }
function p95(s: number[])  { return [...s].sort((x, y) => x - y)[Math.floor(s.length * 0.95)] }

function measureReads(path: string, runs: number): number[] {
  return Array.from({ length: runs }, () => {
    const t = performance.now()
    readFileSync(path, "utf8")
    return performance.now() - t
  })
}

function measureStats(path: string, runs: number): number[] {
  return Array.from({ length: runs }, () => {
    const t = performance.now()
    statSync(path)
    return performance.now() - t
  })
}

function bar(ratio: number, width = 38): string {
  const n = Math.round(ratio * width)
  return "█".repeat(n) + "░".repeat(width - n)
}

function pct(a: number, b: number): string {
  const d = ((a - b) / b) * 100
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%"
}

function row(label: string, toon: string, md: string, diff: string) {
  console.log(`  ${label.padEnd(10)}  ${toon.padEnd(12)}  ${md.padEnd(12)}  ${diff}`)
}

// ── load ──────────────────────────────────────────────────────────────────────

const toonBody = readFileSync(TOON_FILE, "utf8")
const mdBody   = readFileSync(MD_FILE,   "utf8")

// OpenCode injects: "Instructions from: <path>\n<body>"
const toonInjected = `Instructions from: ${TOON_FILE}\n${toonBody}`
const mdInjected   = `Instructions from: ${MD_FILE}\n${mdBody}`

// ── tokens ────────────────────────────────────────────────────────────────────

const toonTok = encode(toonInjected).length
const mdTok   = encode(mdInjected).length
const saved   = mdTok - toonTok

// ── timing ────────────────────────────────────────────────────────────────────

// warm OS cache
readFileSync(TOON_FILE, "utf8"); readFileSync(MD_FILE, "utf8")
statSync(TOON_FILE); statSync(MD_FILE)

const toonReadTimes = measureReads(TOON_FILE, READ_RUNS)
const mdReadTimes   = measureReads(MD_FILE,   READ_RUNS)
const toonStatTimes = measureStats(TOON_FILE, STAT_RUNS)
const mdStatTimes   = measureStats(MD_FILE,   STAT_RUNS)

// ── output ────────────────────────────────────────────────────────────────────

const LINE = "─".repeat(62)
console.log()
console.log("AGENTS.toon vs AGENTS.md — token and timing comparison")
console.log("Tokenizer : cl100k_base (GPT-4 / tiktoken-compatible)")
console.log(`Read timing: median of ${READ_RUNS} runs  |  stat timing: median of ${STAT_RUNS} runs`)
console.log(LINE)

// File size
console.log()
console.log("FILE SIZE (bytes)")
const maxB = Math.max(toonBody.length, mdBody.length)
console.log(`  TOON  ${String(toonBody.length).padStart(5)}  ${bar(toonBody.length / maxB)}`)
console.log(`  MD    ${String(mdBody.length).padStart(5)}  ${bar(mdBody.length / maxB)}`)
console.log(`  TOON is ${pct(toonBody.length, mdBody.length)} vs Markdown`)

// Tokens — as injected
console.log()
console.log("TOKENS — as injected into system prompt (per turn)")
const maxT = Math.max(toonTok, mdTok)
console.log(`  TOON  ${String(toonTok).padStart(5)}  ${bar(toonTok / maxT)}`)
console.log(`  MD    ${String(mdTok).padStart(5)}  ${bar(mdTok / maxT)}`)
console.log(`  TOON saves ${saved} tokens per turn (${pct(toonTok, mdTok)} vs Markdown)`)

// Per-session impact
console.log()
console.log("PER-SESSION TOKEN COST  (rules file tokens × turns)")
const turns = [5, 10, 20, 40]
console.log(`  ${"turns".padEnd(6)}  ${"TOON".padEnd(8)}  ${"MD".padEnd(8)}  saved`)
for (const t of turns) {
  console.log(
    `  ${String(t).padEnd(6)}  ${String(toonTok * t).padEnd(8)}  ${String(mdTok * t).padEnd(8)}  ${saved * t}`
  )
}

// Cost
console.log()
console.log("COST ESTIMATE — 20-turn session, input tokens only")
const models = [
  { name: "claude-sonnet-4.5", usdPer1M: 3.0 },
  { name: "claude-haiku-3.5 ", usdPer1M: 0.8 },
  { name: "gpt-4o           ", usdPer1M: 2.5 },
]
const savedAt20 = saved * 20
for (const m of models) {
  const saving = (savedAt20 / 1_000_000) * m.usdPer1M
  const per100 = (saving * 100).toFixed(4)
  console.log(`  ${m.name}  saves $${saving.toFixed(5)}/session  ($${per100} per 100 sessions)`)
}

// Disk read timing
console.log()
console.log(`DISK READ TIME (µs) — full file read, ${READ_RUNS} runs`)
row("", "TOON", "Markdown", "diff")
row("median", (median(toonReadTimes)*1000).toFixed(1)+"µs", (median(mdReadTimes)*1000).toFixed(1)+"µs", pct(median(toonReadTimes), median(mdReadTimes)))
row("mean",   (mean(toonReadTimes)*1000).toFixed(1)+"µs",   (mean(mdReadTimes)*1000).toFixed(1)+"µs",   pct(mean(toonReadTimes),   mean(mdReadTimes)))
row("p95",    (p95(toonReadTimes)*1000).toFixed(1)+"µs",    (p95(mdReadTimes)*1000).toFixed(1)+"µs",    pct(p95(toonReadTimes),    p95(mdReadTimes)))

// Stat timing — the plugin's hot path
console.log()
console.log(`STAT-ONLY TIME (µs) — plugin hot path when file unchanged, ${STAT_RUNS} runs`)
console.log("  (stat is called every turn; file is only read when mtime/size changes)")
row("", "TOON", "Markdown", "diff")
row("median", (median(toonStatTimes)*1000).toFixed(2)+"µs", (median(mdStatTimes)*1000).toFixed(2)+"µs", pct(median(toonStatTimes), median(mdStatTimes)))
row("mean",   (mean(toonStatTimes)*1000).toFixed(2)+"µs",   (mean(mdStatTimes)*1000).toFixed(2)+"µs",   pct(mean(toonStatTimes),   mean(mdStatTimes)))
row("p95",    (p95(toonStatTimes)*1000).toFixed(2)+"µs",    (p95(mdStatTimes)*1000).toFixed(2)+"µs",    pct(p95(toonStatTimes),    p95(mdStatTimes)))

console.log()
console.log(LINE)
console.log()
