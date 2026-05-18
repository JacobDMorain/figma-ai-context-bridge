# Figma Community Listing

## Plugin Name

Figma AI Context Bridge

## Short Tagline

AI-friendly JSON export and a local MCP bridge for coding agents.

## One-Line Summary

Give Codex, Claude Code, Cursor, and other AI coding agents structured Figma context without dumping noisy raw design JSON.

## Description

Figma AI Context Bridge is built for AI-assisted implementation workflows. It exports the current selection as compact, semantic, AI-friendly JSON and can keep a local MCP bridge synced with your active Figma selection.

Use it when you want an AI coding agent to understand a Figma design before writing or reviewing UI code. The export includes CSS-like layout and visual styles, text, positioning, component definitions, design tokens, interactions, and implementation hints.

## Local MCP Bridge

For live workflows, open the AI Agent Bridge panel in Figma. The plugin pushes a lightweight summary to a local MCP server, then users can click Sync Detail to Agent when an agent needs the full current selection payload. Agents can also search nodes and lazily request detail for the exact node they need. This avoids pushing a full large selection on every change.

## Key Features

- Export AI-friendly JSON for the current Figma selection.
- Sync current selection summary to a local MCP bridge.
- Push current selection detail to agents on demand.
- Let agents search design nodes with `search_nodes`.
- Lazy-load detailed node data with `get_design_node`.
- Preserve tokens, components, layout, text, styles, positioning, interactions, and hints.
- Local-first data flow: no cloud service is used by this repository.

## Privacy / Security Copy

The plugin reads selected Figma design data, including node names, text, layout metadata, styles, variables, components, and interaction metadata.

Direct export downloads or copies JSON locally. MCP bridge mode sends design context only to the configured local loopback MCP server, defaulting to `http://localhost:7800`. This repository does not send data to a cloud service.

Users are responsible for how their AI coding agent handles any design data it receives.

## Suggested Tags

- AI
- MCP
- developer tools
- design to code
- JSON export

## Suggested Thumbnail Text

Figma context for AI coding agents

## Notes For Publisher

- Screenshots and GIFs are optional for the first release.
- Upload `assets/community/icon-128.png` as the plugin icon.
- Upload `assets/community/cover-1920x1080.png` as the Community thumbnail or cover image.
- Keep `assets/community/icon.svg` and `assets/community/cover.svg` as editable source files.
