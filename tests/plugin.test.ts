import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import plugin from "../src/index.ts"

const FILENAME = "AGENTS.toon"
const CONTENT_A = "rules: no_any\nbuild: \"bun tsc\"\n"
const CONTENT_B = "rules: no_any\nbuild: \"bun tsc\"\ntest: \"bun test\"\n"

function makeInput(directory: string, worktree: string) {
  return { directory, worktree } as any
}

function makeOutput() {
  return { system: [] as string[] }
}

async function runHook(
  hook: (input: any, output: any) => Promise<void>,
  directory: string,
  worktree: string,
) {
  const output = makeOutput()
  await hook(makeInput(directory, worktree), output)
  return output.system
}

// ── fixtures ──────────────────────────────────────────────────────────────────

let dir: string
let worktree: string

beforeEach(() => {
  dir      = mkdtempSync(join(tmpdir(), "agents-toon-dir-"))
  worktree = mkdtempSync(join(tmpdir(), "agents-toon-wt-"))
})

afterEach(() => {
  rmSync(dir,      { recursive: true, force: true })
  rmSync(worktree, { recursive: true, force: true })
})

// ── locate ────────────────────────────────────────────────────────────────────

describe("locate", () => {
  it("finds AGENTS.toon in directory", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const system = await runHook(hooks["experimental.chat.system.transform"]!, dir, worktree)
    expect(system).toHaveLength(1)
    expect(system[0]).toContain(CONTENT_A)
  })

  it("falls back to worktree when not in directory", async () => {
    writeFileSync(join(worktree, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const system = await runHook(hooks["experimental.chat.system.transform"]!, dir, worktree)
    expect(system).toHaveLength(1)
    expect(system[0]).toContain(CONTENT_A)
  })

  it("prefers directory over worktree when both exist", async () => {
    writeFileSync(join(dir,      FILENAME), CONTENT_A)
    writeFileSync(join(worktree, FILENAME), CONTENT_B)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const system = await runHook(hooks["experimental.chat.system.transform"]!, dir, worktree)
    expect(system[0]).toContain(CONTENT_A)
    expect(system[0]).not.toContain("bun test") // unique to CONTENT_B
  })

  it("registers no hook and does not push to system when no file exists", async () => {
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    expect(hooks["experimental.chat.system.transform"]).toBeUndefined()
  })
})

// ── injected content format ───────────────────────────────────────────────────

describe("injected content", () => {
  it("prepends 'Instructions from: <path>' header", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const system = await runHook(hooks["experimental.chat.system.transform"]!, dir, worktree)
    expect(system[0]).toMatch(/^Instructions from: .+AGENTS\.toon\n/)
  })

  it("includes the full file body after the header", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const system = await runHook(hooks["experimental.chat.system.transform"]!, dir, worktree)
    expect(system[0]).toContain(CONTENT_A)
  })
})

// ── cache: unchanged file ─────────────────────────────────────────────────────

describe("cache: file unchanged between turns", () => {
  it("serves the same content on consecutive turns", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const hook = hooks["experimental.chat.system.transform"]!

    const first  = await runHook(hook, dir, worktree)
    const second = await runHook(hook, dir, worktree)

    expect(first[0]).toBe(second[0])
  })
})

// ── cache: content changed ────────────────────────────────────────────────────

describe("cache: content changed between turns", () => {
  it("reloads when file content changes", async () => {
    const filePath = join(dir, FILENAME)
    writeFileSync(filePath, CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const hook = hooks["experimental.chat.system.transform"]!

    // First turn — CONTENT_A is on disk.
    const first = await runHook(hook, dir, worktree)
    expect(first[0]).toContain(CONTENT_A)

    // Small delay ensures mtime advances on the next write.
    await Bun.sleep(10)
    writeFileSync(filePath, CONTENT_B)

    // Second turn — plugin must detect the change and reload.
    const second = await runHook(hook, dir, worktree)
    // CONTENT_B contains the unique line 'test: "bun test"' not present in CONTENT_A
    expect(second[0]).toContain('test: "bun test"')
  })

  it("serves updated content on all turns after a reload", async () => {
    const filePath = join(dir, FILENAME)
    writeFileSync(filePath, CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const hook = hooks["experimental.chat.system.transform"]!

    await runHook(hook, dir, worktree)

    await Bun.sleep(10)
    writeFileSync(filePath, CONTENT_B)

    // Turn that triggers reload.
    await runHook(hook, dir, worktree)

    // Subsequent turn should still serve the updated content.
    const next = await runHook(hook, dir, worktree)
    expect(next[0]).toContain(CONTENT_B)
  })
})

// ── system array ──────────────────────────────────────────────────────────────

describe("system array", () => {
  it("pushes exactly one entry per hook call without evaluate", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), undefined as any)
    const hook = hooks["experimental.chat.system.transform"]!

    // Accumulate two calls on the same output object (simulates two turns).
    const output = makeOutput()
    await hook(makeInput(dir, worktree), output)
    await hook(makeInput(dir, worktree), output)
    expect(output.system).toHaveLength(2)
  })
})

// ── evaluate option ───────────────────────────────────────────────────────────

describe("evaluate option", () => {
  it("pushes two entries per hook call when evaluate=true", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), { evaluate: true })
    const hook = hooks["experimental.chat.system.transform"]!

    const output = makeOutput()
    await hook(makeInput(dir, worktree), output)
    // content entry + annotation entry
    expect(output.system).toHaveLength(2)
  })

  it("annotation entry starts with [toon-eval]", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), { evaluate: true })
    const hook = hooks["experimental.chat.system.transform"]!

    const output = makeOutput()
    await hook(makeInput(dir, worktree), output)
    expect(output.system[1]).toMatch(/^\[toon-eval\]/)
  })

  it("pushes one entry per hook call when evaluate=false", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), { evaluate: false })
    const hook = hooks["experimental.chat.system.transform"]!

    const output = makeOutput()
    await hook(makeInput(dir, worktree), output)
    expect(output.system).toHaveLength(1)
  })

  it("accepts string 'true' for evaluate", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), { evaluate: "true" })
    const hook = hooks["experimental.chat.system.transform"]!

    const output = makeOutput()
    await hook(makeInput(dir, worktree), output)
    expect(output.system).toHaveLength(2)
  })

  it("annotation updates when file content changes", async () => {
    const filePath = join(dir, FILENAME)
    writeFileSync(filePath, CONTENT_A)
    const hooks = await plugin.server!(makeInput(dir, worktree), { evaluate: true })
    const hook = hooks["experimental.chat.system.transform"]!

    const first = makeOutput()
    await hook(makeInput(dir, worktree), first)
    const firstAnnotation = first.system[1]

    await Bun.sleep(10)
    // Write a much larger file to change the token count in the annotation.
    writeFileSync(filePath, CONTENT_A + "extra: " + "x".repeat(2000) + "\n")

    const second = makeOutput()
    await hook(makeInput(dir, worktree), second)
    const secondAnnotation = second.system[1]

    // The token count in the annotation should differ.
    expect(firstAnnotation).not.toBe(secondAnnotation)
  })
})
