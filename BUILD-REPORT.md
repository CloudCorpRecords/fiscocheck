# BUILD-REPORT — fiscocheck (Batch 38)

Rebuild of `com.imperioutils/fisco-it` v3.0.0 as `@reneturcios/fiscocheck` 0.1.0,
a forwarding client to the published remote `https://imperioutils.com/api/mcp`.

## Fixture conflicts

None. The fixture (`harness/fixtures/imperioutils-fisco-it-tools-original.json`)
was checked tool-by-tool against the spec before building: 28 tools, in the
spec's order, with the spec's required fields in every case — including the
five empty `required: []` arrays and the three schemas with no `required`
key (see below). The fixture governs and was served verbatim.

## Surface built

- 28 tools, registered via the MCP SDK low-level `Server` API with explicit
  schema literals in `src/forward.ts` (`TOOL_DEFS`), generated programmatically
  by parsing and re-serialising the fixture JSON — never retyped. Tool
  descriptions are in Italian and are served verbatim, untranslated.
- `name`, `title`, `description` and `inputSchema` are served exactly as the
  fixture carries them (the fixture's per-tool keys are exactly those four).
- tools/list is answered locally; tools/call is forwarded upstream as a
  streamable-HTTP JSON-RPC client: initialize → notifications/initialized →
  tools/call, honouring `Mcp-Session-Id` when issued. Upstream results pass
  through verbatim.

## Required fields as served

- 20 tools carry a non-empty `required` array, exactly as captured
  (e.g. `generate_codice_fiscale`: `cognome`, `nome`, `data_nascita`, `sesso`;
  `intrastat_periodicity`: `flusso`, `categoria`, `anno`, `mese`,
  `ammontari_trimestri_precedenti`).
- Empty `required: []`, served verbatim (5): `calc_imu`,
  `intrastat_reference`, `nis2_tipologie`, `nis2_reference`, `verify_payee`.
- NO `required` key, served verbatim (3): `guardian_list_suppliers`,
  `guardian_supplier_ledger`, `guardian_supplier_status`.

Both shapes are explicitly covered by the registration-integrity tests
(deep-equal against the fixture, plus dedicated empty-`[]` and no-key checks
that also assert the counts are exactly 5 and 3).

## Labelled reconstructions (from the spec)

- Upstream endpoint override env `IMPERIOUTILS_MCP_URL` — LABELLED
  RECONSTRUCTION (endpoint itself is pinned: `https://imperioutils.com/api/mcp`).
- API-key forwarding: when env `IMPERIOUTILS_API_KEY` is set, header
  `X-API-Key: <value>` is sent. The header NAME is pinned by the registry
  record's remote declaration; the env NAME and the forwarding are LABELLED
  RECONSTRUCTIONS (the record pins no package env; the capture was keyless).
  When unset, no key header is sent.
- Failure rendering as `fiscocheck error:` text results — LABELLED
  RECONSTRUCTION.
- Judgment calls recorded in the spec and carried into the README: no tool
  submits a filing or executes a payment (`compose_f24` / `intrastat_compose`
  compose documents from caller-supplied rows); `verify_payee` and the
  guardian tools are anti-fraud checks over caller-supplied supplier data;
  `generate_codice_fiscale` computes the deterministic public CF algorithm
  over caller-supplied data.

## File inventory (19-file factory set)

1. `package.json` — `@reneturcios/fiscocheck`, bin `fiscocheck` → `dist/cli.js`,
   deps exactly `@modelcontextprotocol/sdk ^1` + `zod ^3`; devDeps
   `@types/node ^20`, `tsx ^4`, `typescript ^5`.
2. `server.json` — name `io.github.CloudCorpRecords/fiscocheck`; description
   exactly as prescribed, 90 chars (≤100); npm entry carries `"version": "0.1.0"`;
   OCI entry `ghcr.io/cloudcorprecords/fiscocheck:0.1.0` carries NO version field.
3. `Dockerfile` — `node:20-alpine` both stages; label
   `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/fiscocheck"`.
4. `tsconfig.json` — fleet-identical (318 bytes).
5. `.gitignore`
6. `package-lock.json` — see Lockfile below.
7. `README.md` — fresh prose for this rebuild.
8. `LICENSE` — MIT, Copyright (c) 2026 Rene Turcios.
9. `CHANGELOG.md` — single 0.1.0 entry dated 2026-10-28.
10. `src/index.ts`
11. `src/cli.ts`
12. `src/mcp.ts` — low-level Server API, explicit literals.
13. `src/types.ts`
14. `src/forward.ts` — core; exports `VERSION = "0.1.0"`.
15. `test/forward.test.ts`
16. `.github/workflows/ci.yml`
17. `.github/workflows/publish.yml`
18. `.github/workflows/publish-container.yml`
19. `.github/workflows/registry-publish.yml`

Plus this `BUILD-REPORT.md` and the `parity-out/` harness output (not part
of the factory set).

## Lockfile

- Route 3, generated clean from birth in the build dir with NO `node_modules`
  present and NO pre-existing lockfile:
  `npm install --package-lock-only --ignore-scripts --offline`.
- Verified: parses as JSON, `name == @reneturcios/fiscocheck`, **128 entries**
  in `packages`. Offline cache sufficed; the proxy fallback was not needed.
  No other build's lockfile was copied.

## Verification (run by the builder)

- `npm install` (offline cache): succeeded, 0 vulnerabilities reported.
- `npx tsc --noEmit`: exit 0.
- Test suite (`npm test`, fake-fetch only, stubbed JSON-RPC upstream, no live
  network): **52 tests, 52 pass, 0 fail** — including the registration-integrity
  check that the served tools/list deep-equals the fixture's 28 tools in
  order, explicitly covering the five empty `required: []` shapes and the
  three no-`required`-key shapes.
- `npm run build` then `node dist/cli.js --version`: prints `0.1.0`.
- Parity harness:
  `python3 harness/parity.py --original harness/fixtures/imperioutils-fisco-it-tools-original.json --rebuild "stdio:node builds/fiscocheck/dist/cli.js mcp" --out builds/fiscocheck/parity-out`
  → **PASS, parity 100.0** (28/28 identical, no missing, no extra, no schema diffs).

No push, no publish, and no gate runs (mcpaudit/mcpvet/shipcheck) were
performed — those are not the builder's to run.
