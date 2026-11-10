# Changelog

## 0.1.0 (2026-10-28)

- First release: a forwarding client for the hosted imperioutils fisco-it MCP server, serving the 28 captured tools locally for tools/list and forwarding every tools/call upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when issued).
- Tools cover codice fiscale validation and generation, partita IVA, IBAN and PEC validation, CAP and ATECO lookup, forfettario / IVA / reverse-charge / split-payment / IMU calculations, FatturaPA parsing, F24 composition, Intrastat helpers, NIS2 reference data, verify-payee and the five guardian supplier tools. Tool descriptions are served verbatim in Italian, exactly as captured.
- Upstream results pass through verbatim; upstream failures surface as `fiscocheck error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). Upstream endpoint overridable via `IMPERIOUTILS_MCP_URL`; when `IMPERIOUTILS_API_KEY` is set it is sent as an `X-API-Key` header.
