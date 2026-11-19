# opencode-toon-config-plugin — development recipes
# Run any recipe: just <name>
# List all recipes: just

set shell := ["bash", "-euo", "pipefail", "-c"]

# The immutable Git spec this repo's Git-install claim is proven against.
# Bump this pin when a new commit is the committed-dist state you want to
# advertise as supported (never a floating branch).
PLUGIN_GIT_SPEC := "github:mmynsted/opencode-toon-config-plugin#e5fb7ce31d50b41e626903746e8151212028528e"
PLUGIN_ID        := "opencode-toon-config-plugin"

# List available recipes (default)
[group('help')]
help:
    @just --list

# Compile TypeScript to dist/
[group('build')]
build:
    bun tsc

# Type-check without emitting output
[group('build')]
check:
    bun tsc --noEmit

# Remove dist/ and rebuild from scratch
[group('build')]
clean:
    rm -rf dist && bun tsc

# Run the full unit test suite (plugin + heuristic)
[group('test')]
test:
    bun test tests/

# Run only the heuristic scorer tests
[group('test')]
test-heuristic:
    bun test tests/heuristic.test.ts

# Run only the plugin integration tests
[group('test')]
test-plugin:
    bun test tests/plugin.test.ts

# Check dependencies for known vulnerabilities (same check as CI)
[group('test')]
audit:
    bun audit --audit-level=high

# Show heuristic scores for good/bad/hybrid example files
[group('scripts')]
demo:
    bun scripts/demo-evaluate.ts

# Token and timing benchmark: TOON vs Markdown fixture files
[group('scripts')]
bench:
    bun scripts/compare-agents.ts

# Type-check then run all tests (CI equivalent)
[group('combined')]
ci: check test

# Full clean build + all tests
[group('combined')]
all: clean test

# Prove Git installation through OpenCode's own plugin manager in a
# clean temp HOME (sprint 11.TBD). Creates an isolated HOME, runs the
# real `opencode plugin add` against the pinned immutable Git spec,
# then asserts `opencode plugin list` reports the plugin id. Never
# touches the developer's real ~/.config/opencode state.
[group('proof')]
proof-git-install:
    #!/usr/bin/env bash
    set -euo pipefail
    tmp_home="$(mktemp -d "${TMPDIR:-/tmp}/toon-plugin-proof.XXXXXX")"
    trap 'rm -rf "$tmp_home"' EXIT
    mkdir -p "$tmp_home/.config/opencode"
    echo "proof: temp HOME $tmp_home"
    echo "proof: running opencode plugin add {{PLUGIN_GIT_SPEC}}"
    HOME="$tmp_home" opencode plugin add "{{PLUGIN_GIT_SPEC}}"
    echo "proof: running opencode plugin list"
    listing="$(HOME="$tmp_home" opencode plugin list)"
    echo "$listing"
    if ! grep -q "{{PLUGIN_ID}}" <<<"$listing"; then
        echo "proof FAILED: {{PLUGIN_ID}} not reported by opencode plugin list" >&2
        exit 1
    fi
    if grep -qi "No plugins found" <<<"$listing"; then
        echo "proof FAILED: plugin list reports no plugins" >&2
        exit 1
    fi
    echo "proof PASSED: {{PLUGIN_ID}} installed and listed from Git spec {{PLUGIN_GIT_SPEC}}"

# Install git hooks (run once after cloning)
[group('help')]
install-hooks:
    cp scripts/pre-commit.sh .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    @echo "pre-commit hook installed"
