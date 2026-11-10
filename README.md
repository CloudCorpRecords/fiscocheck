# fiscocheck

fiscocheck is a small local bridge to the hosted
imperioutils fisco-it MCP server, a collection of
Italian tax utilities. Through it an agent can check
and generate a codice fiscale, validate a partita
IVA, an IBAN or a PEC address, look up a CAP or an
ATECO code, run the common calculations (regime
forfettario, IVA, reverse charge, split payment,
IMU), parse a FatturaPA document, compose the rows
of an F24 form from amounts the caller has already
calculated, work through Intrastat periodicity and
composition, read NIS2 reference data, verify a
payee, and run the guardian supplier checks. The
tool descriptions upstream are in Italian and this
bridge serves them exactly as captured, untranslated.

The bridge holds no tax tables of its own. It
answers the tool list locally, exactly as captured
from the live endpoint, and forwards each tool call
upstream, returning whatever comes back untouched.
No tool in this surface submits a filing or executes
a payment: the F24 and Intrastat composers assemble
documents from caller-supplied rows, and the
guardian tools check caller-supplied supplier data
(IBAN, partita IVA and codice fiscale checksums, and
the EU VIES public register).

## Tools

28 tools, grouped by area:

- Identifiers: `validate_codice_fiscale`,
  `generate_codice_fiscale`, `validate_partita_iva`,
  `validate_iban`, `validate_pec`.
- Lookups: `lookup_cap`, `lookup_ateco`,
  `search_ateco`.
- Calculations: `calc_forfettario`, `calc_iva`,
  `calc_reverse_charge`, `calc_split_payment`,
  `calc_imu`.
- Documents: `parse_fatturapa`,
  `parse_verify_fatturapa`, `compose_f24`.
- Intrastat: `intrastat_periodicity`,
  `intrastat_compose`, `intrastat_reference`.
- NIS2: `nis2_tipologie`, `nis2_ambito`,
  `nis2_reference`.
- Payee and guardian: `verify_payee`,
  `guardian_list_suppliers`,
  `guardian_supplier_ledger`,
  `guardian_supplier_status`, `guardian_check_iban`,
  `guardian_watch_supplier`.

Five tools (`calc_imu`, `intrastat_reference`,
`nis2_tipologie`, `nis2_reference`, `verify_payee`)
were captured with an empty `required: []` list, and
three guardian tools (`guardian_list_suppliers`,
`guardian_supplier_ledger`,
`guardian_supplier_status`) were captured with no
`required` key at all; both shapes are served
verbatim. Per the original registry record, 23 tools
are free and the 5 guardian tools are the keyed set.

## Configuration

- `IMPERIOUTILS_MCP_URL` (optional) — override the
  upstream endpoint. Defaults to
  `https://imperioutils.com/api/mcp`. (The override
  hook is this rebuild's own labelled reconstruction.)
- `IMPERIOUTILS_API_KEY` (optional) — when set, every
  upstream request carries an `X-API-Key: <key>`
  header, for the caller's own imperioutils API key.
  When it is not set, no key header is sent. (The
  header name is pinned by the original's registry
  record; the record pins no package env name, so
  forwarding the key from this env var is a labelled
  reconstruction — the original surface was captured
  keyless.)

### Forwarding mechanics

On the first tool call the client opens a streamable
HTTP session upstream: a JSON-RPC `initialize`
request (protocolVersion `2025-03-26`, clientInfo
name `fiscocheck`), then a
`notifications/initialized` notification, then the
`tools/call` request carrying the caller's arguments
unchanged. When the upstream answers `initialize`
with an `Mcp-Session-Id` header, that value rides on
every later request of the session, which is reused
for the life of the process. Replies may arrive as
plain JSON or as server-sent events; both are read.

Successful upstream results pass through verbatim,
including any `isError` flag the upstream sets.
Failures — a JSON-RPC error, a non-2xx status, an
unreadable response, or a request that cannot be
completed — come back as an `isError` result whose
text starts with `fiscocheck error:` (this rendering
is this rebuild's own labelled reconstruction).

## CLI

Each tool is also a subcommand taking one JSON
argument string:

```bash
npx @reneturcios/fiscocheck validate_iban '{"iban":"IT60X0542811101000000123456"}'
npx @reneturcios/fiscocheck validate_codice_fiscale '{"codice_fiscale":"RSSMRA80A01H501U"}'
npx @reneturcios/fiscocheck calc_imu '{}'
npx @reneturcios/fiscocheck --version
```

Exit codes: `0` on success, `1` on an `isError`
result, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/fiscocheck mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "fiscocheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/fiscocheck", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/fiscocheck
docker run --rm ghcr.io/cloudcorprecords/fiscocheck --version
```

The container's default command is `mcp`, so the first
form is a stdio MCP server; any other arguments reach
the CLI normally.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

The test suite runs entirely against a stubbed
JSON-RPC upstream — no live network calls.

## License

MIT — see `LICENSE`.
