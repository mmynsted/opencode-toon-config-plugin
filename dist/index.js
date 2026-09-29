import { createHash } from "crypto";
import { statSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { Plugin } from "@opencode/plugin";
import { score, formatAnnotation } from "./heuristic.js";
const FILENAME = "AGENTS.toon";
const SERVICE = "agents-toon";
// Match OpenCode's log format so output lands in the session log file.
// Format: INFO  <ISO-timestamp> +<ms>ms service=agents-toon <message>
let lastMs = Date.now();
function log(msg) {
    const now = Date.now();
    const ts = new Date(now).toISOString().split(".")[0];
    const diff = now - lastMs;
    lastMs = now;
    process.stderr.write(`INFO  ${ts} +${diff}ms service=${SERVICE} ${msg}\n`);
}
function sha256(data) {
    return createHash("sha256").update(data).digest("hex");
}
// Rough token estimate: cl100k_base averages ~4 chars/token for mixed code/text.
// Labelled "~N tok" in logs to make the approximation explicit.
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
// Locate AGENTS.toon: prefer directory (worktree subdir), fall back to worktree root.
function locate(directory, worktree) {
    for (const dir of [directory, worktree]) {
        const p = join(dir, FILENAME);
        if (existsSync(p))
            return p;
    }
    return null;
}
// Build a fresh cache entry from disk. Caller must ensure the file exists.
function load(filePath, evaluate) {
    const stat = statSync(filePath);
    const body = readFileSync(filePath, "utf8");
    const content = `Instructions from: ${filePath}\n${body}`;
    const annotation = evaluate ? formatAnnotation(score(body)) : "";
    return {
        content,
        annotation,
        hash: sha256(body),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        tokens: estimateTokens(content),
    };
}
// Check whether the cached entry is still current; reload from disk only when needed.
// Returns the existing cache unchanged when the file has not changed.
function refresh(filePath, cache, evaluate) {
    let stat;
    try {
        stat = statSync(filePath);
    }
    catch {
        // File was deleted after startup — keep serving the last known content.
        log(`warn: ${FILENAME} not found, serving cached content`);
        return cache;
    }
    // Stage 1: cheap stat check — single syscall, no read required.
    if (stat.mtimeMs === cache.mtimeMs && stat.size === cache.size)
        return cache;
    // Stage 2: stat changed — read and hash to confirm content actually differs.
    const body = readFileSync(filePath, "utf8");
    const hash = sha256(body);
    if (hash === cache.hash) {
        // Identical content despite stat change (e.g. touch or no-op save).
        return { ...cache, mtimeMs: stat.mtimeMs, size: stat.size };
    }
    const content = `Instructions from: ${filePath}\n${body}`;
    const tokens = estimateTokens(content);
    const annotation = evaluate ? formatAnnotation(score(body)) : "";
    log(`reload: ${stat.size}B ~${tokens} tok`);
    return { content, annotation, hash, mtimeMs: stat.mtimeMs, size: stat.size, tokens };
}
// Validate and extract the evaluate option from plugin options.
// Accepts: true, false, "true", "false", or absent (defaults to false).
function resolveEvaluate(options) {
    if (options === undefined)
        return false;
    const v = options["evaluate"];
    if (v === true || v === "true")
        return true;
    if (v === false || v === "false" || v === undefined)
        return false;
    log(`warn: unrecognised evaluate option value "${String(v)}", defaulting to false`);
    return false;
}
// Resolve the instance for a directory, or null when no AGENTS.toon exists.
function initInstance(directory, worktree, evaluate) {
    const filePath = locate(directory, worktree);
    if (!filePath) {
        log(`no ${FILENAME} found`);
        return null;
    }
    const cache = load(filePath, evaluate);
    log(`loaded: ${filePath} ${cache.size}B ~${cache.tokens} tok${evaluate ? " evaluate=on" : ""}`);
    if (evaluate && cache.annotation)
        log(`eval: ${cache.annotation.split("\n")[0]}`);
    return { filePath, cache, evaluate };
}
// Append the cached content (and annotation) to a system-instructions array.
// V2 session hooks pass event.system as Array<SystemPart> ({ type: "text", text }).
function applyToSystem(instance, system) {
    instance.cache = refresh(instance.filePath, instance.cache, instance.evaluate);
    system.push({ type: "text", text: instance.cache.content });
    if (instance.evaluate && instance.cache.annotation)
        system.push({ type: "text", text: instance.cache.annotation });
}
export default Plugin.define({
    id: "opencode-toon-config-plugin",
    async setup(ctx) {
        const evaluate = resolveEvaluate(ctx.options);
        // Prefer the session location directory, fall back to the project directory
        // (worktree root). ctx.location.directory is the session's working directory;
        // ctx.location.project.directory is the project/worktree root in V2.
        const instance = initInstance(ctx.location.directory, ctx.location.project.directory, evaluate);
        if (!instance)
            return;
        await ctx.session.hook("context", (event) => {
            applyToSystem(instance, event.system);
        });
    },
});
//# sourceMappingURL=index.js.map