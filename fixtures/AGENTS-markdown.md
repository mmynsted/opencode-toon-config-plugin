# AI Agent Rules for Velox Project

## Critical Rules

- Never redirect stderr in test recipes (`2>/dev/null` or `2>&1`)
- Always use `just` commands for testing, never call pytest directly
- Parse TOON format for test results
- Never prefix commands with `cd` to workspace root

## Test Commands

- Fast: `just py-test-fast`
- Unit: `just py-test-unit`
- Integration: `just py-test-integration`
- Single test: `just py-test-run <nodeid>`
- Multiple tests: `just py-test-run-multi <nodeid1> <nodeid2>`
- All tests: `just test`
- Fix/format: `just py-fix`

## Test Output Schema

- `success`: boolean
- `summary`: object with integer fields: collected, run, passed, failed, error, skipped
- `failed_tests`: array of objects with fields: nodeid, file, function, domain, test_type
- `collection_errors`: array of objects with fields: nodeid, longrepr

## Exit Codes

- `0`: success
- `1`: test failures — check `failed_tests` array
- `2`: config error — check stderr JSON

## Failure Action

Extract nodeid from `failed_tests` array, then run: `just py-test-run <nodeid>`

## Infrastructure Requirements

- No infrastructure: unit tests
- PostgreSQL: persistence tests
- Redis: cache tests
- RabbitMQ: queue tests

## Source Layout

- Nim scripts: `scripts/pytest_*.nim` — produce structured JSON
- Python source: `src/velox/{domain,services,adapters,cli}`
- Tests: `tests/{domain,services,fakes,adapters,features,cli,api}`

## Workflow

1. Run `just py-test-fast`
2. Check `success: true`
3. If failed, check `failed_tests[]`
4. Run `just py-test-run <nodeid>`

## Workspace

- Root: `/home/user/projects/velox`
- Rule: never prefix commands with `cd <workspace_root>`
- Reason: workspace root is already the working directory

## Project

- Type: logistics routing service
- Purpose: real-time shipment tracking with event-driven updates
- Architecture: hexagonal domain-driven design
- Source of record: PostgreSQL
- Databases: PostgreSQL (primary), Redis (cache)

## Development Workflow

- After file change: `just py-fix` (formats, checks, fixes Python files)
- Before commit: `just py-test-fast` (quick validation)
- Roadmap/specs: `docs/roadmap/` (authoritative implementation specs)

## Architecture Layers (import-linter enforced)

- `domain`: pure business logic, no external deps
- `ports`: protocol contracts only
- `services`: orchestration, domain and ports only
- `adapters`: external integrations, config, domain, ports
- `cli_api`: entry points, factories, adapters, domain

## Critical Paths

- Justfile: `project_root/Justfile` — all build/test recipes
- Config: `src/velox/config.py` — all environment variables
- Constants: `src/velox/domain/constants.py` — canonical patterns and constraints
- Compositor: `src/velox/cli/_compositor.py` — adapter wiring, only place concrete adapters are named

## Coding Standards

- Functions: ≤20 lines, verb-noun naming
- Classes: ≤300 lines, ≤20 public methods
- Protocols: `typing.Protocol` only, no `abc.ABC`
- Prefer composition over inheritance

## Test Strategy

- Tests mirror src structure
- Fakes preferred over mocks
- Integration tests marked with `@pytest.mark.integration`
- TDD: write failing test first
- Property-based testing: use Hypothesis for data functions

## Data Flow

- Ingest: webhook → payload parsing → field resolution → shipment service → PostgreSQL + Redis
- Export: shipment service → JSON serialiser → REST response
- Query: query service → PostgreSQL adapter → indexed lookup → query results

## Domain Model

- Shipment fields: id, tracking_number, origin, destination, status, created, last_updated, carrier, weight_kg, events, metadata
- Shipment status values: pending, in_transit, out_for_delivery, delivered, exception, cancelled
- Event types: pickup, departure, arrival, customs, delivery_attempt, delivered
- Carrier codes: kebab-case, max 2 levels, optional region namespace

## Service Operations

- Shipment service: insert, upsert, get, update, cancel, list, export
- Query service: search shipments with validation and limit clamping

## Environment Variables

- `DATABASE_URL`: `postgresql://localhost:5432/velox`
- `REDIS_URL`: `redis://localhost:6379/0`
- `CARRIER_API_KEY`: (required, no default)
- `QUERY_LIMIT`: `20`
- `LOG_LEVEL`: `INFO`
