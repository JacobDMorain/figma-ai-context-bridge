# Privacy

Figma AI Context Bridge is designed for local AI agent workflows.

## What Data Is Read

When you export or sync a selection, the plugin may read:

- node ids, names, types, and hierarchy
- text characters
- layout and positioning metadata
- colors, typography, effects, fills, strokes, and spacing
- component and variant metadata
- design variables and styles when available
- interaction metadata exposed by the selected nodes

## Where Data Goes

Direct export:

- writes JSON to a local download, or
- copies JSON to your clipboard.

MCP bridge mode:

- sends selected design context to the local loopback server configured in the plugin manifest
- defaults to `http://localhost:7800`
- does not send data to a cloud service from this repository

## AI Agent Responsibility

If you pass exported or MCP-provided data to an AI agent, that agent's own privacy policy and data handling rules apply.

Do not export confidential or restricted designs to third-party agents unless your organization allows it.

## Local Server Boundary

The MCP server stores data in memory only. Restarting the server clears cached summary, detail, diff, and request data.

