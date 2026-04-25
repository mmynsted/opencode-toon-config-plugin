```toon
rules: "never_redirect_stderr_test_recipes|use_just_commands|parse_toon_format|never_cd_to_workspace_root"
cmds:
  fast: "just py-test-fast"
  unit: "just py-test-unit"
  integration: "just py-test-integration"
  single: "just py-test-run nodeid"
  multi: "just py-test-run-multi nodeid1 nodeid2"
  all: "just test"
  fix: "just py-fix"
output:
  success: bool
  summary: "{collected run passed failed error skipped}:int"
  failed_tests: "[]:{nodeid file function domain test_type}"
  collection_errors: "[]:{nodeid longrepr}"
errors:
  0: success
  1: test_failures_check_failed_tests_array
  2: config_error_check_stderr_json
action: "extract_nodeid_from_failed_tests_array_then_run: just py-test-run nodeid"
needs:
  none: unit_tests
  postgresql: persistence_tests
  redis: cache_tests
  rabbitmq: queue_tests
nim: "scripts/pytest_*.nim|produces_structured_json"
python: "src/velox/{domain,services,adapters,cli}"
tests: "tests/{domain,services,fakes,adapters,features,cli,api}"
workflow: "just py-test-fast|check_success:true|check_failed_tests[]|just py-test-run nodeid"
workspace:
  root: "/home/user/projects/velox"
  rule: "never_prefix_commands_with_cd_workspace_root"
  reason: "workspace_root_is_already_working_directory"
project:
  type: "logistics_routing_service"
  purpose: "real_time_shipment_tracking_with_event_driven_updates"
  architecture: "hexagonal_domain_driven_design"
  source_of_record: "postgresql"
  databases: "postgresql_primary_redis_cache"
dev:
  after_file_change: "just py-fix"
  test_before_commit: "just py-test-fast"
  roadmap_specs: "docs/roadmap/"
layers:
  domain: "pure_business_logic|no_external_deps"
  ports: "protocol_contracts_only"
  services: "orchestration|domain_ports_only"
  adapters: "external_integrations|config_domain_ports"
  cli_api: "entry_points|factories_adapters_domain"
paths:
  justfile: "project_root/Justfile"
  config: "src/velox/config.py"
  constants: "src/velox/domain/constants.py"
  compositor: "src/velox/cli/_compositor.py"
style:
  functions: "<=20_lines|verb_noun_naming"
  classes: "<=300_lines|<=20_public_methods"
  protocols: "typing.Protocol_only|no_abc_ABC"
  composition: "over_inheritance"
testing:
  structure: "tests_mirror_src_structure"
  fakes: "preferred_over_mocks"
  integration_mark: "@pytest.mark.integration"
  tdd: "write_failing_test_first"
  property_based: "hypothesis_for_data_functions"
data_flow:
  ingest: "webhook->payload_parsing->field_resolution->shipment_service->postgresql+redis"
  export: "shipment_service->json_serialiser->rest_response"
  query: "query_service->postgresql_adapter->indexed_lookup->query_results"
domain:
  shipment_fields: "id|tracking_number|origin|destination|status|created|last_updated|carrier|weight_kg|events|metadata"
  shipment_status: "pending|in_transit|out_for_delivery|delivered|exception|cancelled"
  event_types: "pickup|departure|arrival|customs|delivery_attempt|delivered"
  carrier_codes: "kebab_case|max_2_levels|optional_region_namespace"
services:
  shipment_service: "insert|upsert|get|update|cancel|list|export"
  query_service: "search_shipments_with_validation_and_limit_clamping"
env_vars:
  database_url: "postgresql://localhost:5432/velox"
  redis_url: "redis://localhost:6379/0"
  carrier_api_key: "required_no_default"
  query_limit: "20"
  log_level: "INFO"
```
