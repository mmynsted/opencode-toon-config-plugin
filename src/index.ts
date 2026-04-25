import { createHash } from "crypto"
import { statSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import type { PluginModule, PluginOptions } from "@opencode-ai/plugin"
import { score, formatAnnotation } from "./heuristic.js"

const FILENAME = "AGENTS.toon"
const SERVICE = "agents-toon"

// Match OpenCode's log format so output lands in the session log file.
// Format: INFO  <ISO-timestamp> +<ms>ms service=agents-toon <message>
let lastMs = Date.now()
function log(msg: string) {
  const now = Date.now()
  const ts = new Date(now).toISOString().split(".")[0]
  const diff = now - lastMs
  lastMs = now
  process.stderr.write(`INFO  ${ts} +${diff}ms service=${SERVICE} ${msg}\n`)
}

type Cache = {
  content: string    // ready-to-inject string ("Instructions from: <path>\n<body>")
  annotation: string // heuristic score annotation (empty string when evaluate=false)
  hash: string       // SHA-256 of raw file body
  mtimeMs: number    // mtime at last read
  size: number       // byte size at last read
  tokens: number     // estimated token count of injected content
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex")
}

// Rough token estimate: cl100k_base averages ~4 chars/token for mixed code/text.
// Labelled "~N tok" in logs to make the approximation explicit.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Locate AGENTS.toon: prefer directory (worktree subdir), fall back to worktree root.
function locate(directory: string, worktree: string): string | null {
  for (const dir of [directory, worktree]) {
    const p = join(dir, FILENAME)
    if (existsSync(p)) return p
  }
  return null
}

// Build a fresh cache entry from disk. Caller must ensure the file exists.
function load(filePath: string, evaluate: boolean): Cache {
  const stat = statSync(filePath)
  const body = readFileSync(filePath, "utf8")
  const content = `Instructions from: ${filePath}\n${body}`
  const annotation = evaluate ? formatAnnotation(score(body)) : ""
  return {
    content,
    annotation,
    hash: sha256(body),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    tokens: estimateTokens(content),
  }
}

// Check whether the cached entry is still current; reload from disk only when needed.
// Returns the existing cache unchanged when the file has not changed.
function refresh(filePath: string, cache: Cache, evaluate: boolean): Cache {
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(filePath)
  } catch {
    // File was deleted after startup — keep serving the last known content.
    log(`warn: ${FILENAME} not found, serving cached content`)
    return cache
  }

  // Stage 1: cheap stat check — single syscall, no read required.
  if (stat.mtimeMs === cache.mtimeMs && stat.size === cache.size) return cache

  // Stage 2: stat changed — read and hash to confirm content actually differs.
  const body = readFileSync(filePath, "utf8")
  const hash = sha256(body)

  if (hash === cache.hash) {
    // Identical content despite stat change (e.g. touch or no-op save).
    return { ...cache, mtimeMs: stat.mtimeMs, size: stat.size }
  }

  const content = `Instructions from: ${filePath}\n${body}`
  const tokens = estimateTokens(content)
  const annotation = evaluate ? formatAnnotation(score(body)) : ""
  log(`reload: ${stat.size}B ~${tokens} tok`)
  return { content, annotation, hash, mtimeMs: stat.mtimeMs, size: stat.size, tokens }
}

// Validate and extract the evaluate option from plugin options.
// Accepts: true, false, "true", "false", or absent (defaults to false).
function resolveEvaluate(options: PluginOptions | undefined): boolean {
  if (options === undefined) return false
  const v = options["evaluate"]
  if (v === true || v === "true") return true
  if (v === false || v === "false" || v === undefined) return false
  log(`warn: unrecognised evaluate option value "${String(v)}", defaulting to false`)
  return false
}

const plugin: PluginModule = {
  id: "opencode-toon-config-plugin",
  server: async ({ directory, worktree }, options) => {
    const evaluate = resolveEvaluate(options)
    const filePath = locate(directory, worktree)

    if (!filePath) {
      log(`no ${FILENAME} found`)
      return {}
    }

    let cache = load(filePath, evaluate)
    log(`loaded: ${filePath} ${cache.size}B ~${cache.tokens} tok${evaluate ? " evaluate=on" : ""}`)
    if (evaluate && cache.annotation) log(`eval: ${cache.annotation.split("\n")[0]}`)

    return {
      "experimental.chat.system.transform": async (_input, output) => {
        cache = refresh(filePath, cache, evaluate)
        output.system.push(cache.content)
        if (evaluate && cache.annotation) output.system.push(cache.annotation)
      },
    }
  },
}

export default plugin
export const { server } = plugin
