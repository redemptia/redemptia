# Redemptia for Cursor

Connects Cursor to [Redemptia Cloud](https://redemptia.example)'s MCP server, so the agent can read how AI
answer engines describe and cite your brand and manage the prompts Redemptia tracks.

Cursor asks you to sign in to Redemptia the first time the server is used. Tools and setup for other
clients are documented at <https://redemptia.example/docs/api/mcp>.

A self-hosted Redemptia serves the same endpoint on its own address; point `~/.cursor/mcp.json` at
`<your APP_URL>/api/mcp` instead of installing this plugin.
