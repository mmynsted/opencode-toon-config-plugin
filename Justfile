# opencode-agents-toon — development recipes
# Run any recipe: just <name>
# List all recipes: just

set shell := ["bash", "-euo", "pipefail", "-c"]

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
