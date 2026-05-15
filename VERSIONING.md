# Versioning

Figma AI Context Bridge uses Semantic Versioning for release artifacts and explicit schema versioning for exported AI JSON.

## Release Artifacts

The public release has two versioned artifacts:

- Figma plugin package: root `package.json`
- Local MCP bridge package: `mcp-server/package.json`

For v1, these versions move together. A release tagged `v1.0.0` should include:

- the Figma plugin release package
- the standalone MCP server package/zip
- matching root and MCP server package versions
- an updated `CHANGELOG.md`

## Semantic Versioning

Use standard `MAJOR.MINOR.PATCH` rules:

- `PATCH`: bug fixes, documentation fixes, release packaging fixes, and compatible internal refactors.
- `MINOR`: additive features that keep existing AI JSON fields, MCP tools, resources, prompts, and menu commands compatible.
- `MAJOR`: breaking changes to exported JSON semantics, MCP tool names or input/output contracts, release package layout, or required setup flow.

## AI JSON schema

AI exports include `schemaVersion`.

Current schema:

- `2.1.0`

Schema versioning is independent from the plugin release version:

- Schema `PATCH`: clarifications or schema metadata corrections that do not change valid payload shape.
- Schema `MINOR`: additive fields or enum values that older consumers can ignore.
- Schema `MAJOR`: renamed/removed fields, changed meanings, changed required fields, or incompatible type changes.

Rules:

- Do not remove existing AI JSON fields in a minor or patch release.
- Prefer additive fields for AI agent improvements.
- Keep `schema/ai-export.schema.json` in sync with serializer output.
- Add compatibility tests for any schema change.

## MCP Tools

MCP tool, resource, and prompt changes follow release SemVer:

- Additive tools/resources/prompts are `MINOR`.
- New optional input fields are `MINOR`.
- New output fields are `MINOR` if existing fields remain stable.
- Removing or renaming tools/resources/prompts is `MAJOR`.
- Changing required inputs or changing output meaning is `MAJOR`.

Existing tools should remain stable once published:

- `get_connection_status`
- `get_design_summary`
- `get_design_selection`
- `get_design_diff`
- `get_design_tokens`
- `get_component_definitions`
- `get_design_node`
- `search_nodes`

## Figma Plugin Manifest

The manifest `id` identifies the Community plugin and must remain stable across updates.

Current plugin id:

- `1637034190973606413`

Do not change the manifest id unless intentionally publishing a separate plugin.

## Release Checklist

Before tagging a release:

1. Update root `package.json` and `package-lock.json`.
2. Update `mcp-server/package.json` and `mcp-server/package-lock.json`.
3. Update `CHANGELOG.md`.
4. If AI JSON changed, update `schema/ai-export.schema.json` and tests.
5. Run `npm.cmd run assets:render` if community SVG assets changed.
6. Run `npm.cmd run verify`.
7. Generate release packages with the verified scripts.
