# opencode-toon-config-plugin — development recipes
# Run any recipe: just <name>
# List all recipes: just

set shell := ["bash", "-euo", "pipefail", "-c"]

# The immutable Git spec this repo's Git-install claim is proven against.
# Bump this pin when a new commit is the committed-dist state you want to
# advertise as supported (never a floating branch).
PLUGIN_GIT_SPEC := "github:mmynsted/opencode-toon-config-plugin#v0.1.4"
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
# clean temp HOME (sprint 11.TBD). Creates an isolated HOME, pins a free
# service port (plugin list starts a managed service; the default port
# would collide with any already-running opencode service), runs the
# real `opencode plugin add` against the pinned immutable Git tag, then
# asserts the spec is written to the temp global config and that
# `opencode plugin list --builtin` reports the plugin id or the pinned
# Git spec. The list check is best-effort with retries because a fresh
# temp-home service may load the plugin asynchronously. Never touches
# the developer's real ~/.config/opencode state.
[group('proof')]
proof-git-install:
    #!/usr/bin/env bash
    set -euo pipefail
    tmp_home="$(mktemp -d "${TMPDIR:-/tmp}/toon-plugin-proof.XXXXXX")"
    trap 'rm -rf "$tmp_home"' EXIT
    mkdir -p "$tmp_home/.config/opencode"
    echo "proof: temp HOME $tmp_home"
    # Pin a free service port inside the isolated HOME so plugin list's
    # managed service never races the developer's running service.
    port=""
    for _ in 1 2 3 4 5; do
        candidate=$((20000 + RANDOM % 20000))
        if ! nc -z 127.0.0.1 "$candidate" 2>/dev/null; then
            port="$candidate"
            break
        fi
    done
    if [ -z "$port" ]; then
        echo "proof FAILED: could not find a free service port" >&2
        exit 1
    fi
    HOME="$tmp_home" opencode service set port "$port" >/dev/null
    echo "proof: running opencode plugin add {{PLUGIN_GIT_SPEC}}"
    HOME="$tmp_home" opencode plugin add "{{PLUGIN_GIT_SPEC}}"

    echo "proof: verifying global config contains the pinned spec"
    config_file="$tmp_home/.config/opencode/opencode.json"
    if ! grep -q "{{PLUGIN_GIT_SPEC}}" "$config_file"; then
        echo "proof FAILED: $config_file does not contain {{PLUGIN_GIT_SPEC}}" >&2
        exit 1
    fi

    # The list check MUST run with cwd inside the temp HOME, not the repo:
    # the repo's own opencode.json removes this plugin id ("-opencode-
    # toon-config-plugin") and adds a local "." dev source, and plugin list
    # resolves location config from process.cwd(), so running from the repo
    # hides the freshly installed Git plugin (observed live 2026-11-21).
    echo "proof: polling opencode plugin list --builtin until {{PLUGIN_ID}} or {{PLUGIN_GIT_SPEC}} appears"
    listing=""
    for attempt in 1 2 3 4 5 6 7 8; do
        listing="$(cd "$tmp_home" && HOME="$tmp_home" opencode plugin list --builtin 2>/dev/null || true)"
        if grep -q "{{PLUGIN_ID}}" <<<"$listing" || grep -q "{{PLUGIN_GIT_SPEC}}" <<<"$listing"; then
            break
        fi
        echo "proof: plugin not listed yet, waiting (attempt $attempt/8)"
        sleep 2
    done
    echo "$listing"
    if grep -q "{{PLUGIN_ID}}" <<<"$listing" || grep -q "{{PLUGIN_GIT_SPEC}}" <<<"$listing"; then
        echo "proof PASSED: {{PLUGIN_ID}} installed and listed from Git spec {{PLUGIN_GIT_SPEC}}"
    else
        echo "proof FAILED: config contains {{PLUGIN_GIT_SPEC}}, but plugin list did not report it in this temp-home service run" >&2
        exit 1
    fi

# Install git hooks (run once after cloning)
[group('help')]
install-hooks:
    cp scripts/pre-commit.sh .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    @echo "pre-commit hook installed"
