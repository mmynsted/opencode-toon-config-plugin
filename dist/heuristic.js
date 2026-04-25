// Heuristic scorer for AGENTS.toon (and any AI instruction file).
//
// Scores only the two objective dimensions that static analysis can assess
// reliably without an LLM:
//   - token_efficiency  (weight 0.20)
//   - structural_quality (weight 0.15)
//
// Subjective dimensions (actionability, exactness, non_redundancy,
// completeness) require LLM judgment and are not scored here.
//
// The result is injected into the system prompt as a compact annotation so
// the AI is aware of structural issues and can proactively surface them.
// Rough token estimate matching the one in index.ts (cl100k_base ~4 chars/tok).
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
// Detect the dominant format of the file body.
//
// TOON files use indented key:value pairs and pipe-separated lists.
// They do NOT use markdown headers (# ...) or bullet lists (- ...).
// A file with a ```toon fence surrounded by markdown is "hybrid".
function detectFormat(body) {
    const hasToonFence = /^```toon\s*$/m.test(body);
    const hasMarkdownHeaders = /^#{1,6}\s+\S/m.test(body);
    const hasMarkdownBullets = /^[ \t]*[-*]\s+\S/m.test(body);
    const hasMarkdownContent = hasMarkdownHeaders || hasMarkdownBullets;
    if (hasToonFence && hasMarkdownContent)
        return "hybrid";
    if (hasToonFence)
        return "toon";
    if (hasMarkdownContent)
        return "markdown";
    // Detect raw TOON: at least one key:value line (word chars followed by colon
    // and a value or nested block), no markdown markers.
    const hasToonKeyValue = /^\s*[a-zA-Z_][\w]*\s*:(\s*\S.*)?$/m.test(body);
    if (hasToonKeyValue)
        return "toon";
    return "other";
}
// Count the maximum nesting depth of indented key:value lines.
// Only counts lines that look like TOON key:value pairs (not markdown bullets).
function maxNestingDepth(body) {
    let max = 0;
    for (const line of body.split("\n")) {
        if (!/^\s+\S/.test(line))
            continue;
        // Skip markdown bullets
        if (/^\s*[-*]\s/.test(line))
            continue;
        const indent = line.match(/^(\s+)/)?.[1].length ?? 0;
        // 2-space indent per level
        const depth = Math.ceil(indent / 2);
        if (depth > max)
            max = depth;
    }
    return max;
}
// Count lines that use pipe-separated values (TOON list idiom).
function pipeSeparatedLines(body) {
    return body.split("\n").filter(l => /:\s*"[^"]*\|[^"]*"/.test(l) || /:\s*\S+\|\S+/.test(l)).length;
}
// Count markdown bullet lines.
function bulletLines(body) {
    return body.split("\n").filter(l => /^\s*[-*]\s+\S/.test(l)).length;
}
// Count markdown header lines.
function headerLines(body) {
    return body.split("\n").filter(l => /^#{1,6}\s+\S/.test(l)).length;
}
// Count lines that look like verbose key names (>15 chars before the colon).
function verboseKeyLines(body) {
    return body.split("\n").filter(l => /^(\s*)([a-z_]{16,})\s*:/.test(l)).length;
}
// Score token efficiency 1–5.
// Anchors (from rubric):
//   5 = TOON throughout, pipe lists, under 500 tokens
//   4 = mostly TOON/compact, under 700 tokens
//   3 = hybrid or Markdown with some compaction, 700–1200 tokens
//   2 = full Markdown prose, 1200–2000 tokens
//   1 = verbose prose, over 2000 tokens
function scoreTokenEfficiency(body, tokens, format, pipes, bullets, headers) {
    // Start from a format-based baseline then adjust for token count.
    let base;
    if (format === "toon")
        base = 5;
    else if (format === "hybrid")
        base = 3;
    else if (format === "markdown")
        base = 2;
    else
        base = 3;
    // Token count adjustments
    if (tokens > 2000)
        base = Math.min(base, 1);
    else if (tokens > 1200)
        base = Math.min(base, 2);
    else if (tokens > 700)
        base = Math.min(base, 3);
    else if (tokens <= 500 && format === "toon")
        base = Math.max(base, 5);
    // Penalise heavy bullet/header use even in hybrid files
    const contentLines = body.split("\n").filter(l => l.trim().length > 0).length;
    if (contentLines > 0) {
        const bulletRatio = bullets / contentLines;
        const headerRatio = headers / contentLines;
        if (bulletRatio > 0.4)
            base = Math.max(1, base - 1);
        if (headerRatio > 0.15)
            base = Math.max(1, base - 1);
    }
    // Reward pipe usage in non-pure-toon files
    if (format !== "toon" && pipes >= 3)
        base = Math.min(5, base + 1);
    return Math.max(1, Math.min(5, base));
}
// Score structural quality 1–5.
// Anchors (from rubric):
//   5 = nesting ≤3 levels, short keys, tabular arrays, 2-space indent
//   4 = mostly flat, 1-2 deep chains
//   3 = some nesting >3 or verbose keys
//   2 = frequent deep nesting, long keys
//   1 = structure obscures meaning
function scoreStructuralQuality(maxDepth, verboseKeys, format) {
    // Markdown files get a structural penalty by default — headers and bullets
    // are inherently less structured than nested keys.
    let score;
    if (format === "markdown")
        score = 2;
    else if (format === "hybrid")
        score = 3;
    else
        score = 5;
    // Nesting depth penalties
    if (maxDepth > 5)
        score = Math.max(1, score - 2);
    else if (maxDepth > 3)
        score = Math.max(1, score - 1);
    // Verbose key penalties
    if (verboseKeys > 5)
        score = Math.max(1, score - 1);
    return Math.max(1, Math.min(5, score));
}
// Build the list of human-readable warnings.
function buildWarnings(tokens, maxDepth, verboseKeys, format, bullets, headers) {
    const w = [];
    if (tokens > 500)
        w.push(`file_over_500_tokens(~${tokens})`);
    if (maxDepth > 3)
        w.push(`nesting_depth_${maxDepth}_exceeds_3`);
    if (verboseKeys > 0)
        w.push(`${verboseKeys}_verbose_key(s)_over_15_chars`);
    if (format === "markdown")
        w.push("pure_markdown_use_toon_for_token_savings");
    if (format === "hybrid")
        w.push("hybrid_consider_moving_prose_into_toon_fence");
    if (bullets > 5)
        w.push(`${bullets}_markdown_bullets_replace_with_pipe_lists`);
    if (headers > 3)
        w.push(`${headers}_markdown_headers_replace_with_nested_keys`);
    return w;
}
export function score(body) {
    const tokens = estimateTokens(body);
    const format = detectFormat(body);
    const maxDepth = maxNestingDepth(body);
    const pipes = pipeSeparatedLines(body);
    const bullets = bulletLines(body);
    const headers = headerLines(body);
    const verboseKeys = verboseKeyLines(body);
    const tokenEfficiency = scoreTokenEfficiency(body, tokens, format, pipes, bullets, headers);
    const structuralQuality = scoreStructuralQuality(maxDepth, verboseKeys, format);
    const warnings = buildWarnings(tokens, maxDepth, verboseKeys, format, bullets, headers);
    return { tokenEfficiency, structuralQuality, tokens, format, warnings };
}
// Format the score as a compact system-prompt annotation.
// Kept short deliberately — it is injected on every turn.
export function formatAnnotation(s) {
    const lines = [
        `[toon-eval] format=${s.format} tokens=~${s.tokens}`,
        `  token_efficiency=${s.tokenEfficiency}/5 structural_quality=${s.structuralQuality}/5`,
    ];
    if (s.warnings.length > 0)
        lines.push(`  warnings: ${s.warnings.join(", ")}`);
    return lines.join("\n");
}
//# sourceMappingURL=heuristic.js.map