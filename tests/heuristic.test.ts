import { describe, it, expect } from "bun:test"
import { score, formatAnnotation } from "../src/heuristic.ts"
import { readFileSync } from "fs"
import { join } from "path"

// ── format detection ──────────────────────────────────────────────────────────

describe("format detection", () => {
  it("detects pure toon", () => {
    const body = "rules: no_any\nbuild: \"bun tsc\"\n"
    expect(score(body).format).toBe("toon")
  })

  it("detects pure markdown", () => {
    const body = "# Rules\n\n- Never use any\n- Always use ESM\n"
    expect(score(body).format).toBe("markdown")
  })

  it("detects hybrid (toon fence inside markdown)", () => {
    const body = "# Rules\n\n```toon\nrules: no_any\n```\n"
    expect(score(body).format).toBe("hybrid")
  })

  it("detects other for plain text without markers", () => {
    const body = "just some plain text with no structure"
    expect(score(body).format).toBe("other")
  })
})

// ── token efficiency ──────────────────────────────────────────────────────────

describe("token efficiency scoring", () => {
  it("scores pure toon under 500 tokens as 5", () => {
    // ~100 chars = ~25 tokens
    const body = "rules: no_any\nbuild: \"bun tsc\"\ntest: \"bun test\"\n"
    const s = score(body)
    expect(s.format).toBe("toon")
    expect(s.tokenEfficiency).toBe(5)
  })

  it("scores pure markdown as ≤2", () => {
    const body = readFileSync(join(import.meta.dir, "../fixtures/AGENTS-markdown.md"), "utf8")
    const s = score(body)
    expect(s.format).toBe("markdown")
    expect(s.tokenEfficiency).toBeLessThanOrEqual(2)
  })

  it("scores toon fixture higher than markdown fixture", () => {
    const toon = readFileSync(join(import.meta.dir, "../fixtures/AGENTS-toon.md"), "utf8")
    const md   = readFileSync(join(import.meta.dir, "../fixtures/AGENTS-markdown.md"), "utf8")
    expect(score(toon).tokenEfficiency).toBeGreaterThan(score(md).tokenEfficiency)
  })

  it("penalises heavy bullet usage in hybrid files", () => {
    const manyBullets = "```toon\nrules: ok\n```\n" + "- item\n".repeat(20)
    const fewBullets  = "```toon\nrules: ok\n```\n" + "- item\n".repeat(2)
    expect(score(manyBullets).tokenEfficiency).toBeLessThanOrEqual(score(fewBullets).tokenEfficiency)
  })
})

// ── structural quality ────────────────────────────────────────────────────────

describe("structural quality scoring", () => {
  it("scores shallow toon as 5", () => {
    const body = "rules: no_any\nbuild:\n  cmd: \"bun tsc\"\n"
    const s = score(body)
    expect(s.format).toBe("toon")
    expect(s.structuralQuality).toBe(5)
  })

  it("penalises nesting depth >3", () => {
    const deep = "a:\n  b:\n    c:\n      d:\n        e: value\n"
    const shallow = "a:\n  b: value\n"
    expect(score(deep).structuralQuality).toBeLessThan(score(shallow).structuralQuality)
  })

  it("penalises verbose keys", () => {
    const verbose = "this_is_a_very_long_key_name: value\nanother_extremely_verbose_key: value\n"
    const concise = "key: value\nother: value\n"
    expect(score(verbose).structuralQuality).toBeLessThanOrEqual(score(concise).structuralQuality)
  })

  it("scores pure markdown lower than pure toon structurally", () => {
    const toon = "rules: no_any\nbuild: \"bun tsc\"\n"
    const md   = "# Rules\n\n- Never use any\n"
    expect(score(toon).structuralQuality).toBeGreaterThan(score(md).structuralQuality)
  })
})

// ── warnings ──────────────────────────────────────────────────────────────────

describe("warnings", () => {
  it("warns when file is over 500 tokens", () => {
    // ~2500 chars = ~625 tokens
    const body = "key: " + "a".repeat(2500) + "\n"
    expect(score(body).warnings.some(w => w.startsWith("file_over_500_tokens"))).toBe(true)
  })

  it("warns on nesting depth >3", () => {
    const body = "a:\n  b:\n    c:\n      d:\n        e: value\n"
    expect(score(body).warnings.some(w => w.startsWith("nesting_depth"))).toBe(true)
  })

  it("warns on pure markdown format", () => {
    const body = "# Title\n\n- item one\n- item two\n"
    expect(score(body).warnings).toContain("pure_markdown_use_toon_for_token_savings")
  })

  it("warns on many markdown bullets", () => {
    const body = "- item\n".repeat(10)
    expect(score(body).warnings.some(w => w.includes("markdown_bullets"))).toBe(true)
  })

  it("produces no warnings for a clean toon file under 500 tokens", () => {
    const body = "rules: no_any\nbuild: \"bun tsc\"\ntest: \"bun test\"\n"
    expect(score(body).warnings).toHaveLength(0)
  })
})

// ── formatAnnotation ──────────────────────────────────────────────────────────

describe("formatAnnotation", () => {
  it("includes format and token count on first line", () => {
    const body = "rules: no_any\n"
    const ann = formatAnnotation(score(body))
    expect(ann).toMatch(/^\[toon-eval\] format=toon tokens=~\d+/)
  })

  it("includes both scores on second line", () => {
    const body = "rules: no_any\n"
    const ann = formatAnnotation(score(body))
    const lines = ann.split("\n")
    expect(lines[1]).toMatch(/token_efficiency=\d\/5 structural_quality=\d\/5/)
  })

  it("includes warnings line only when warnings exist", () => {
    const clean = "rules: no_any\n"
    const noWarnings = formatAnnotation(score(clean))
    expect(noWarnings.split("\n")).toHaveLength(2)

    const md = "# Title\n\n- item\n- item\n"
    const withWarnings = formatAnnotation(score(md))
    expect(withWarnings.split("\n")).toHaveLength(3)
    expect(withWarnings).toContain("warnings:")
  })
})
