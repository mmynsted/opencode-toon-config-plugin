import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import plugin from "../src/index.ts"

const FILENAME = "AGENTS.toon"
const CONTENT_A = "rules: no_any\nbuild: \"bun tsc\"\n"
const CONTENT_B = "rules: no_any\nbuild: \"bun tsc\"\ntest: \"bun test\"\n"

// V2 plugin context shape (only the fields the plugin reads).
function makeContext(directory: string, worktree: string, options?: Record<string, unknown>) {
  return {
    location: {
      directory,
      project: { directory: worktree },
    },
    options,
    session: {
      // Captures hook registrations so tests can trigger them directly.
      registrations: {} as Record<string, (event: unknown) => Promise<void> | void>,
      hook: async (name: string, callback: (event: unknown) => Promise<void> | void) => {
        const registrations = makeContext.hooks
        registrations[name] = callback
        return { dispose: () => {} }
      },
    },
  }
}

// Shared hook store per context; reset by makeContext.
makeContext.hooks = {} as Record<string, (event: unknown) => Promise<void> | void>

// Run a registered session hook with a V2-shaped event (system: Array<SystemPart>).
async function runHook(
  ctx: ReturnType<typeof makeContext>,
  name: string,
): Promise<Array<{ type: "text"; text: string }>> {
  const hook = makeContext.hooks[name]
  if (!hook) throw new Error(`hook ${name} not registered`)
  const system: Array<{ type: "text"; text: string }> = []
  await hook({ system })
  return system
}

// Setup the plugin like the V2 host does, returning the context.
async function setupPlugin(directory: string, worktree: string, options?: Record<string, unknown>) {
  makeContext.hooks = {}
  const ctx = makeContext(directory, worktree, options)
  await plugin.setup(ctx as never)
  return ctx
}

// ── fixtures ──────────────────────────────────────────────────────────────────

let dir: string
let worktree: string

beforeEach(() => {
  dir      = mkdtempSync(join(tmpdir(), "agents-toon-dir-"))
  worktree = mkdtempSync(join(tmpdir(), "agents-toon-wt-"))
  makeContext.hooks = {}
})

afterEach(() => {
  rmSync(dir,      { recursive: true, force: true })
  rmSync(worktree, { recursive: true, force: true })
})

// ── plugin shape ──────────────────────────────────────────────────────────────

describe("plugin shape", () => {
  it("default export matches the V2 Plugin.define shape (id + setup only)", () => {
    expect(plugin.id).toBe("opencode-toon-config-plugin")
    expect(typeof plugin.setup).toBe("function")
    // No V1-era keys: the V2 loader rejects unknown extra keys.
    expect(Object.keys(plugin).sort()).toEqual(["id", "setup"])
  })

  it("setup is async and returns undefined (or a cleanup function)", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const result = await plugin.setup(makeContext(dir, worktree) as never)
    expect(result === undefined || typeof result === "function").toBe(true)
  })
})

// ── locate ────────────────────────────────────────────────────────────────────

describe("locate", () => {
  it("finds AGENTS.toon in directory", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    await setupPlugin(dir, worktree)
    const system = await runHook(makeContext(dir, worktree), "context")
    expect(system).toHaveLength(1)
    expect(system[0].text).toContain(CONTENT_A)
  })

  it("falls back to worktree when not in directory", async () => {
    writeFileSync(join(worktree, FILENAME), CONTENT_A)
    await setupPlugin(dir, worktree)
    const system = await runHook(makeContext(dir, worktree), "context")
    expect(system).toHaveLength(1)
    expect(system[0].text).toContain(CONTENT_A)
  })

  it("prefers directory over worktree when both exist", async () => {
    writeFileSync(join(dir,      FILENAME), CONTENT_A)
    writeFileSync(join(worktree, FILENAME), CONTENT_B)
    await setupPlugin(dir, worktree)
    const system = await runHook(makeContext(dir, worktree), "context")
    expect(system[0].text).toContain(CONTENT_A)
    expect(system[0].text).not.toContain("bun test") // unique to CONTENT_B
  })

  it("registers no hook when no file exists", async () => {
    await setupPlugin(dir, worktree)
    expect(makeContext.hooks["context"]).toBeUndefined()
  })
})

// ── injected content format ───────────────────────────────────────────────────

describe("injected content", () => {
  it("prepends 'Instructions from: <path>' header", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    await setupPlugin(dir, worktree)
    const system = await runHook(makeContext(dir, worktree), "context")
    expect(system[0].text).toMatch(/^Instructions from: .+AGENTS\.toon\n/)
  })

  it("includes the full file body after the header", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    await setupPlugin(dir, worktree)
    const system = await runHook(makeContext(dir, worktree), "context")
    expect(system[0].text).toContain(CONTENT_A)
  })

  it("pushes V2 SystemPart objects ({ type: 'text', text })", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    await setupPlugin(dir, worktree)
    const system = await runHook(makeContext(dir, worktree), "context")
    expect(system[0].type).toBe("text")
    expect(typeof system[0].text).toBe("string")
  })
})

// ── cache: unchanged file ─────────────────────────────────────────────────────

describe("cache: file unchanged between turns", () => {
  it("serves the same content on consecutive turns", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const ctx = await setupPlugin(dir, worktree)
    const first  = await runHook(ctx, "context")
    const second = await runHook(ctx, "context")
    expect(first[0].text).toBe(second[0].text)
  })
})

// ── cache: content changed ────────────────────────────────────────────────────

describe("cache: content changed between turns", () => {
  it("reloads when file content changes", async () => {
    const filePath = join(dir, FILENAME)
    writeFileSync(filePath, CONTENT_A)
    const ctx = await setupPlugin(dir, worktree)

    // First turn — CONTENT_A is on disk.
    const first = await runHook(ctx, "context")
    expect(first[0].text).toContain(CONTENT_A)

    // Small delay ensures mtime advances on the next write.
    await Bun.sleep(10)
    writeFileSync(filePath, CONTENT_B)

    // Second turn — plugin must detect the change and reload.
    const second = await runHook(ctx, "context")
    // CONTENT_B contains the unique line 'test: "bun test"' not present in CONTENT_A
    expect(second[0].text).toContain('test: "bun test"')
  })

  it("serves updated content on all turns after a reload", async () => {
    const filePath = join(dir, FILENAME)
    writeFileSync(filePath, CONTENT_A)
    const ctx = await setupPlugin(dir, worktree)

    await runHook(ctx, "context")

    await Bun.sleep(10)
    writeFileSync(filePath, CONTENT_B)

    // Turn that triggers reload.
    await runHook(ctx, "context")

    // Subsequent turn should still serve the updated content.
    const next = await runHook(ctx, "context")
    expect(next[0].text).toContain(CONTENT_B)
  })
})

// ── system array ──────────────────────────────────────────────────────────────

describe("system array", () => {
  it("pushes exactly one entry per hook call without evaluate", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const ctx = await setupPlugin(dir, worktree)

    // Accumulate two calls on the same system array (simulates two turns).
    const hook = makeContext.hooks["context"]!
    const system: Array<{ type: "text"; text: string }> = []
    await hook({ system })
    await hook({ system })
    expect(system).toHaveLength(2)
  })
})

// ── evaluate option ───────────────────────────────────────────────────────────

describe("evaluate option", () => {
  it("pushes two entries per hook call when evaluate=true", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const ctx = await setupPlugin(dir, worktree, { evaluate: true })

    const system = await runHook(ctx, "context")
    // content entry + annotation entry
    expect(system).toHaveLength(2)
  })

  it("annotation entry starts with [toon-eval]", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const ctx = await setupPlugin(dir, worktree, { evaluate: true })

    const system = await runHook(ctx, "context")
    expect(system[1].text).toMatch(/^\[toon-eval\]/)
  })

  it("pushes one entry per hook call when evaluate=false", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const ctx = await setupPlugin(dir, worktree, { evaluate: false })

    const system = await runHook(ctx, "context")
    expect(system).toHaveLength(1)
  })

  it("accepts string 'true' for evaluate", async () => {
    writeFileSync(join(dir, FILENAME), CONTENT_A)
    const ctx = await setupPlugin(dir, worktree, { evaluate: "true" })

    const system = await runHook(ctx, "context")
    expect(system).toHaveLength(2)
  })

  it("annotation updates when file content changes", async () => {
    const filePath = join(dir, FILENAME)
    writeFileSync(filePath, CONTENT_A)
    const ctx = await setupPlugin(dir, worktree, { evaluate: true })

    const firstSystem = await runHook(ctx, "context")
    const firstAnnotation = firstSystem[1].text

    await Bun.sleep(10)
    // Write a much larger file to change the token count in the annotation.
    writeFileSync(filePath, CONTENT_A + "extra: " + "x".repeat(2000) + "\n")

    const secondSystem = await runHook(ctx, "context")
    const secondAnnotation = secondSystem[1].text

    // The token count in the annotation should differ.
    expect(firstAnnotation).not.toBe(secondAnnotation)
  })
})
