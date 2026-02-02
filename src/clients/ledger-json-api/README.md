# Ledger JSON API Client

This client provides a type-safe interface for interacting with the
[Ledger JSON API](https://docs.digitalasset.com/build/3.4/reference/json-api/openapi).

## Reference Documentation

- [Ledger JSON API OpenAPI Reference](https://docs.digitalasset.com/build/3.4/reference/json-api/openapi) - REST API specification
- [Ledger API Protocol Buffers](https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html) - Canonical protobuf definitions

## Schema Mapping

The Zod schemas in `schemas/` map directly to the Ledger API protobuf definitions. The protobuf source files
are available in `libs/splice/canton/community/ledger-api/src/main/protobuf/com/daml/ledger/api/v2/`.
