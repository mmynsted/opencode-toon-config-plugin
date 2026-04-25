#!/usr/bin/env bash
set -euo pipefail

echo "pre-commit: building dist/..."
just build

# Stage any updated build output so the commit includes the fresh dist/
git add dist/

echo "pre-commit: dist/ up to date"
