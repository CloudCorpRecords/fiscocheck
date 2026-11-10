import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  FiscocheckClient,
  callTool,
  createClient,
  DEFAULT_ENDPOINT_URL,
  isKnownTool,
  parseRpcBody,
  PROTOCOL_VERSION,
  TOOL_DEFS,
  TOOL_NAMES,
  VERSION,
} from "../src/forward.js";
import { handleCallTool } from "../src/mcp.js";
import type {
  FetchFn,
  FetchResponseLike,
  ToolDef,
  ToolResult,
} from "../src/types.js";

/**
 * All tests run against a stubbed JSON-RPC upstream that
 * implements the streamable-HTTP session flow
 * (initialize -> notifications/initialized -> tools/call):
 * no live network, and the real imperioutils endpoint
 * is never contacted.
 */

const FIXTURE_URL = new URL(
  "../../../harness/fixtures/imperioutils-fisco-it-tools-original.json",
  import.meta.url,
);
const FIXTURE_AVAILABLE = existsSync(FIXTURE_URL);
const fixture = (
  FIXTURE_AVAILABLE
    ? JSON.parse(readFileSync(FIXTURE_URL, "utf-8"))
    : { tools: [] }
) as {
  tools: ToolDef[];
};
/**
 * Publish-survival guard (Wave 25 preflight, proven Wave 24 pattern):
 * the parity fixture lives in the build harness, outside the published
 * repo tree, so fixture-dependent tests skip cleanly when it is absent;
 * with the fixture present they run in full, with no skips.
 */
function skipWithoutFixture(t: {
  skip: (message: string) => void;
}): boolean {
  if (FIXTURE_AVAILABLE) return false;
  t.skip("parity fixture lives in the build harness, not the repo tree");
  return true;
}


const EXPECTED_NAMES = [
  "validate_codice_fiscale",
  "generate_codice_fiscale",
  "validate_partita_iva",
  "validate_iban",
  "lookup_cap",
  "validate_pec",
  "lookup_ateco",
  "search_ateco",
  "calc_forfettario",
  "parse_fatturapa",
  "parse_verify_fatturapa",
  "calc_iva",
  "calc_reverse_charge",
  "calc_split_payment",
  "calc_imu",
  "compose_f24",
  "intrastat_periodicity",
  "intrastat_compose",
  "intrastat_reference",
  "nis2_tipologie",
  "nis2_ambito",
  "nis2_reference",
  "verify_payee",
  "guardian_list_suppliers",
  "guardian_supplier_ledger",
  "guardian_supplier_status",
  "guardian_check_iban",
  "guardian_watch_supplier",
];

const EMPTY_REQUIRED = [
  "calc_imu",
  "intrastat_reference",
  "nis2_tipologie",
  "nis2_reference",
  "verify_payee",
];

const NO_REQUIRED_KEY = [
  "guardian_list_suppliers",
  "guardian_supplier_ledger",
  "guardian_supplier_status",
];

const SAMPLE_RESULT = {
  content: [{ type: "text", text: "{\"valid\":true}" }],
  structuredContent: { valid: true },
};

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface FakeOptions {
  callResult?: Record<string, unknown>;
  callBodyText?: string;
  callError?: Record<string, unknown>;
  callStatus?: number;
  initError?: Record<string, unknown>;
  throwOn?: "initialize" | "tools/call";
  sessionId?: string | null;
  hangOnCall?: boolean;
  sse?: boolean;
}

function makeResponse(
  status: number,
  bodyText: string,
  headers: Record<string, string> = {},
): FetchResponseLike {
  const lowered = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowered.get(name.toLowerCase()) ?? null },
    text: async () => bodyText,
  };
}

function jsonResponse(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return makeResponse(status, JSON.stringify(payload), headers);
}

function makeUpstream(options: FakeOptions = {}): {
  fetchFn: FetchFn;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    calls.push({ url, headers: init?.headers ?? {}, body });
    const method = body.method as string;
    if (options.throwOn === method) throw new Error("socket hang up");
    if (method === "initialize") {
      if (options.initError !== undefined) {
        return jsonResponse(200, {
          jsonrpc: "2.0",
          id: body.id,
          error: options.initError,
        });
      }
      const headers: Record<string, string> = {};
      const sessionId =
        options.sessionId === undefined ? "sess-xyz" : options.sessionId;
      if (sessionId !== null) headers["mcp-session-id"] = sessionId;
      return jsonResponse(
        200,
        {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            serverInfo: { name: "fisco-it", version: "3.0.0" },
          },
        },
        headers,
      );
    }
    if (method === "notifications/initialized") {
      return makeResponse(202, "");
    }
    if (method === "tools/call") {
      if (options.hangOnCall) {
        return new Promise<FetchResponseLike>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            if (signal.aborted) {
              reject(new Error("aborted"));
              return;
            }
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }
        });
      }
      if (options.callBodyText !== undefined) {
        return makeResponse(options.callStatus ?? 200, options.callBodyText);
      }
      if (options.callError !== undefined) {
        return jsonResponse(200, {
          jsonrpc: "2.0",
          id: body.id,
          error: options.callError,
        });
      }
      const result = options.callResult ?? SAMPLE_RESULT;
      const payload = { jsonrpc: "2.0", id: body.id, result };
      if (options.sse) {
        return makeResponse(
          200,
          `event: message\ndata: ${JSON.stringify(payload)}\n\n`,
        );
      }
      return jsonResponse(options.callStatus ?? 200, payload);
    }
    return jsonResponse(200, {});
  };
  return { fetchFn, calls };
}

function stubClient(options: FakeOptions = {}, extra: Record<string, unknown> = {}) {
  const upstream = makeUpstream(options);
  const c = new FiscocheckClient({
    fetchFn: upstream.fetchFn,
    env: {},
    ...extra,
  });
  return { client: c, calls: upstream.calls };
}

function textOf(result: ToolResult): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0].text;
}

function methods(calls: Captured[]): string[] {
  return calls.map((c) => c.body.method as string);
}

function byName(name: string): ToolDef {
  const found = TOOL_DEFS.find((t) => t.name === name);
  assert.ok(found, `tool ${name} present`);
  return found;
}

/* ------------------------------------------------------------------ */

describe("registration integrity (captured surface)", () => {
  it("serves exactly the fixture's 28 tools, deep-equal, in order", (t) => {
    if (skipWithoutFixture(t)) return;
    assert.equal(fixture.tools.length, 28);
    assert.deepEqual(TOOL_DEFS, fixture.tools);
  });

  it("serves the 28 tool names in fixture order", (t) => {
    if (skipWithoutFixture(t)) return;
    assert.deepEqual(TOOL_NAMES, EXPECTED_NAMES);
    assert.deepEqual(
      TOOL_NAMES,
      fixture.tools.map((t) => t.name),
    );
  });

  it("carries exactly the fixture's keys on each tool", () => {
    for (const tool of TOOL_DEFS) {
      assert.deepEqual(Object.keys(tool).sort(), [
        "description",
        "inputSchema",
        "name",
        "title",
      ]);
    }
  });

  it("carries a non-empty title on every tool, as captured", () => {
    for (const tool of TOOL_DEFS) {
      assert.equal(typeof tool.title, "string");
      assert.ok((tool.title as string).length > 0);
    }
  });

  it("serves the five empty required: [] arrays verbatim", () => {
    assert.equal(EMPTY_REQUIRED.length, 5);
    for (const name of EMPTY_REQUIRED) {
      const schema = byName(name).inputSchema as Record<string, unknown>;
      assert.equal("required" in schema, true, `${name} carries required`);
      assert.deepEqual(schema.required, [], `${name} required is []`);
    }
    // Exactly five tools carry an empty required array, no more.
    const emptyCount = TOOL_DEFS.filter((t) => {
      const r = (t.inputSchema as { required?: unknown }).required;
      return Array.isArray(r) && r.length === 0;
    }).length;
    assert.equal(emptyCount, 5);
  });

  it("serves the three schemas with NO required key verbatim", () => {
    assert.equal(NO_REQUIRED_KEY.length, 3);
    for (const name of NO_REQUIRED_KEY) {
      const schema = byName(name).inputSchema as Record<string, unknown>;
      assert.equal("required" in schema, false, `${name} has no required key`);
    }
    const noKeyCount = TOOL_DEFS.filter(
      (t) => !("required" in (t.inputSchema as Record<string, unknown>)),
    ).length;
    assert.equal(noKeyCount, 3);
  });

  it("carries exactly the fixture's required fields for the other tools", () => {
    const expected: Record<string, string[]> = {
      validate_codice_fiscale: ["codice_fiscale"],
      generate_codice_fiscale: ["cognome", "nome", "data_nascita", "sesso"],
      validate_partita_iva: ["partita_iva"],
      validate_iban: ["iban"],
      lookup_cap: ["cap"],
      validate_pec: ["email"],
      lookup_ateco: ["code"],
      search_ateco: ["q"],
      calc_forfettario: ["ricavi"],
      parse_fatturapa: ["xml_content"],
      parse_verify_fatturapa: ["xml_content"],
      calc_iva: ["imponibile"],
      calc_reverse_charge: ["imponibile", "paese_cedente"],
      calc_split_payment: ["imponibile"],
      compose_f24: ["kind"],
      intrastat_periodicity: [
        "flusso",
        "categoria",
        "anno",
        "mese",
        "ammontari_trimestri_precedenti",
      ],
      intrastat_compose: ["anno", "mese", "righe"],
      nis2_ambito: ["tipologia_id"],
      guardian_check_iban: ["iban"],
      guardian_watch_supplier: ["suppliers"],
    };
    assert.equal(Object.keys(expected).length, 20);
    for (const [name, required] of Object.entries(expected)) {
      assert.deepEqual(
        (byName(name).inputSchema as { required?: string[] }).required,
        required,
        name,
      );
    }
  });

  it("carries every fixture property, in order, for all tools", (t) => {
    if (skipWithoutFixture(t)) return;
    for (let i = 0; i < 28; i += 1) {
      const served = Object.keys(
        (TOOL_DEFS[i].inputSchema as { properties: object }).properties,
      );
      const expected = Object.keys(
        (fixture.tools[i].inputSchema as { properties: object }).properties,
      );
      assert.deepEqual(served, expected, TOOL_DEFS[i].name);
    }
  });

  it("isKnownTool recognises all 28 built tools and rejects others", () => {
    for (const name of EXPECTED_NAMES) assert.equal(isKnownTool(name), true);
    assert.equal(isKnownTool("validate"), false);
    assert.equal(isKnownTool(""), false);
    assert.equal(isKnownTool("guardian_delete_supplier"), false);
  });
});

/* ------------------------------------------------------------------ */

describe("session establishment and reuse", () => {
  it("runs initialize, notifications/initialized, then tools/call in order", async () => {
    const { client: c, calls } = stubClient();
    const out = await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.equal(out.isError, undefined);
    assert.deepEqual(methods(calls), [
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
    assert.ok(calls.every((call) => call.url === DEFAULT_ENDPOINT_URL));
    assert.equal(DEFAULT_ENDPOINT_URL, "https://imperioutils.com/api/mcp");
    for (const call of calls) {
      assert.equal(call.headers["Content-Type"], "application/json");
      assert.equal(call.headers["Accept"], "application/json, text/event-stream");
    }
    assert.equal(calls[0].headers["Mcp-Session-Id"], undefined);
    assert.equal(calls[1].headers["Mcp-Session-Id"], "sess-xyz");
    assert.equal(calls[2].headers["Mcp-Session-Id"], "sess-xyz");
  });

  it("sends clientInfo name fiscocheck and the pinned protocol version on initialize", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool("lookup_cap", { cap: "20121" });
    const initParams = calls[0].body.params as Record<string, unknown>;
    assert.equal(initParams.protocolVersion, PROTOCOL_VERSION);
    assert.equal(PROTOCOL_VERSION, "2025-03-26");
    assert.deepEqual(initParams.capabilities, {});
    assert.deepEqual(initParams.clientInfo, { name: "fiscocheck", version: VERSION });
  });

  it("establishes the session lazily once and reuses it on later calls", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    await c.callTool("calc_imu", {});
    assert.deepEqual(methods(calls), [
      "initialize",
      "notifications/initialized",
      "tools/call",
      "tools/call",
    ]);
    assert.equal(calls[3].headers["Mcp-Session-Id"], "sess-xyz");
    assert.notEqual(calls[2].body.id, calls[3].body.id);
  });

  it("sends no session header when the upstream issues none", async () => {
    const { client: c, calls } = stubClient({ sessionId: null });
    const out = await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.equal(out.isError, undefined);
    assert.ok(calls.every((call) => call.headers["Mcp-Session-Id"] === undefined));
  });

  it("honours the IMPERIOUTILS_MCP_URL env override", async () => {
    const upstream = makeUpstream();
    const c = new FiscocheckClient({
      fetchFn: upstream.fetchFn,
      env: { IMPERIOUTILS_MCP_URL: "https://staging.example.com/api/mcp" },
    });
    await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.ok(
      upstream.calls.every((call) => call.url === "https://staging.example.com/api/mcp"),
    );
  });

  it("honours an explicit url override over the env override", async () => {
    const upstream = makeUpstream();
    const c = createClient({
      fetchFn: upstream.fetchFn,
      env: { IMPERIOUTILS_MCP_URL: "https://env.example.com/mcp" },
      url: "https://explicit.example.com/mcp",
    });
    await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.ok(
      upstream.calls.every((call) => call.url === "https://explicit.example.com/mcp"),
    );
  });

  it("falls back to the pinned endpoint when the env override is blank", async () => {
    const upstream = makeUpstream();
    const c = new FiscocheckClient({
      fetchFn: upstream.fetchFn,
      env: { IMPERIOUTILS_MCP_URL: "   " },
    });
    await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.ok(upstream.calls.every((call) => call.url === DEFAULT_ENDPOINT_URL));
  });
});

/* ------------------------------------------------------------------ */

describe("upstream key header", () => {
  it("sends X-API-Key on every request when IMPERIOUTILS_API_KEY is set", async () => {
    const upstream = makeUpstream();
    const c = new FiscocheckClient({
      fetchFn: upstream.fetchFn,
      env: { IMPERIOUTILS_API_KEY: "imp-key-42" },
    });
    await c.callTool("guardian_list_suppliers", {});
    assert.equal(upstream.calls.length, 3);
    assert.ok(
      upstream.calls.every((call) => call.headers["X-API-Key"] === "imp-key-42"),
    );
  });

  it("sends no X-API-Key header when IMPERIOUTILS_API_KEY is unset", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.ok(calls.every((call) => call.headers["X-API-Key"] === undefined));
  });

  it("never sends an Authorization header, with or without a key", async () => {
    const withKey = makeUpstream();
    const c1 = new FiscocheckClient({
      fetchFn: withKey.fetchFn,
      env: { IMPERIOUTILS_API_KEY: "imp-key-42" },
    });
    await c1.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.ok(withKey.calls.every((call) => call.headers["Authorization"] === undefined));
    const { client: c2, calls } = stubClient();
    await c2.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.ok(calls.every((call) => call.headers["Authorization"] === undefined));
  });
});

/* ------------------------------------------------------------------ */

describe("tools/call forwarding", () => {
  it("forwards a validate_iban call verbatim", async () => {
    const { client: c, calls } = stubClient();
    const args = { iban: "IT60X0542811101000000123456" };
    await c.callTool("validate_iban", args);
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, "validate_iban");
    assert.deepEqual(params.arguments, args);
  });

  it("forwards a generate_codice_fiscale call verbatim", async () => {
    const { client: c, calls } = stubClient();
    const args = {
      cognome: "Rossi",
      nome: "Mario",
      data_nascita: "1980-01-01",
      sesso: "M",
    };
    await c.callTool("generate_codice_fiscale", args);
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, "generate_codice_fiscale");
    assert.deepEqual(params.arguments, args);
  });

  it("forwards a calc_imu call with empty arguments verbatim", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool("calc_imu", {});
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, "calc_imu");
    assert.deepEqual(params.arguments, {});
  });

  it("forwards a guardian_list_suppliers call with empty arguments verbatim", async () => {
    const { client: c, calls } = stubClient();
    await c.callTool("guardian_list_suppliers", {});
    const params = calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, "guardian_list_suppliers");
    assert.deepEqual(params.arguments, {});
  });

  it("passes the upstream result through verbatim, including extra fields", async () => {
    const { client: c } = stubClient();
    const out = await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.deepEqual(out, SAMPLE_RESULT);
  });

  it("passes an upstream isError result through untouched", async () => {
    const upstreamResult = {
      content: [{ type: "text", text: "iban non valido" }],
      isError: true,
    };
    const { client: c } = stubClient({ callResult: upstreamResult });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.deepEqual(out, upstreamResult);
  });

  it("reads an SSE-framed tools/call response", async () => {
    const { client: c } = stubClient({ sse: true });
    const out = await c.callTool("validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.equal(out.isError, undefined);
    assert.deepEqual(out, SAMPLE_RESULT);
  });

  it("the one-shot callTool helper forwards under the right tool name", async () => {
    const upstream = makeUpstream();
    const out = await callTool(
      "lookup_cap",
      { cap: "20121" },
      { fetchFn: upstream.fetchFn, env: {} },
    );
    assert.equal(out.isError, undefined);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, "lookup_cap");
    assert.deepEqual(params.arguments, { cap: "20121" });
  });
});

/* ------------------------------------------------------------------ */

describe("upstream failures surface as fiscocheck error text", () => {
  it("maps a JSON-RPC error to `fiscocheck error: <message>`", async () => {
    const { client: c } = stubClient({
      callError: { code: -32000, message: "validation failed upstream" },
    });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "fiscocheck error: validation failed upstream");
  });

  it("maps an initialize JSON-RPC error to fiscocheck error text", async () => {
    const { client: c } = stubClient({
      initError: { code: -32600, message: "bad initialize" },
    });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "fiscocheck error: bad initialize");
  });

  it("maps an unparseable upstream response to a malformed-response error", async () => {
    const { client: c } = stubClient({ callBodyText: "<html>oops</html>" });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "fiscocheck error: malformed response");
  });

  it("maps a response with no result object to a malformed-response error", async () => {
    const { client: c } = stubClient({
      callBodyText: '{"jsonrpc":"2.0","id":3,"result":null}',
    });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "fiscocheck error: malformed response");
  });

  it("maps a non-2xx upstream status to fiscocheck error text", async () => {
    const { client: c } = stubClient({ callBodyText: "internal error", callStatus: 500 });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "fiscocheck error: HTTP 500");
  });

  it("maps a throwing fetch to fiscocheck error text", async () => {
    const { client: c } = stubClient({ throwOn: "tools/call" });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.match(textOf(out), /^fiscocheck error: /);
  });

  it("maps a throwing initialize fetch to fiscocheck error text", async () => {
    const { client: c } = stubClient({ throwOn: "initialize" });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.equal(textOf(out), "fiscocheck error: socket hang up");
  });

  it("maps a timed-out call to fiscocheck error text", async () => {
    const { client: c } = stubClient({ hangOnCall: true }, { timeoutMs: 20 });
    const out = await c.callTool("validate_iban", { iban: "bad" });
    assert.equal(out.isError, true);
    assert.match(textOf(out), /^fiscocheck error: /);
  });
});

/* ------------------------------------------------------------------ */

describe("parseRpcBody", () => {
  it("parses plain JSON and picks the message with the matching id", () => {
    const body = '{"jsonrpc":"2.0","id":7,"result":{"ok":true}}';
    assert.deepEqual(parseRpcBody(body, 7), {
      jsonrpc: "2.0",
      id: 7,
      result: { ok: true },
    });
  });

  it("parses SSE data lines", () => {
    const body =
      'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n';
    assert.deepEqual(parseRpcBody(body, 2), {
      jsonrpc: "2.0",
      id: 2,
      result: { ok: true },
    });
  });

  it("picks the matching id among several SSE messages", () => {
    const body =
      'data: {"jsonrpc":"2.0","id":1,"result":{"n":1}}\n\n' +
      'data: {"jsonrpc":"2.0","id":2,"result":{"n":2}}\n\n';
    assert.deepEqual(parseRpcBody(body, 2), {
      jsonrpc: "2.0",
      id: 2,
      result: { n: 2 },
    });
  });

  it("ignores the SSE [DONE] sentinel", () => {
    const body =
      'data: {"jsonrpc":"2.0","id":4,"result":{"ok":true}}\ndata: [DONE]\n';
    assert.deepEqual(parseRpcBody(body, 4), {
      jsonrpc: "2.0",
      id: 4,
      result: { ok: true },
    });
  });

  it("returns null for empty and unparseable bodies", () => {
    assert.equal(parseRpcBody(""), null);
    assert.equal(parseRpcBody("not json at all"), null);
    assert.equal(parseRpcBody("[1,2,3]"), null);
  });
});

/* ------------------------------------------------------------------ */

describe("MCP layer validation", () => {
  it("rejects an unknown tool with MethodNotFound before any network hop", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    await assert.rejects(
      () => handleCallTool(c, "not_a_tool", {}),
      (err: unknown) =>
        err instanceof McpError && err.code === ErrorCode.MethodNotFound,
    );
    assert.equal(upstream.calls.length, 0);
  });

  it("rejects array arguments with InvalidParams before any network hop", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    await assert.rejects(
      () => handleCallTool(c, "validate_iban", ["nope"]),
      (err: unknown) =>
        err instanceof McpError && err.code === ErrorCode.InvalidParams,
    );
    assert.equal(upstream.calls.length, 0);
  });

  it("rejects string arguments with InvalidParams before any network hop", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    await assert.rejects(
      () => handleCallTool(c, "lookup_cap", "cap=20121"),
      (err: unknown) =>
        err instanceof McpError && err.code === ErrorCode.InvalidParams,
    );
    assert.equal(upstream.calls.length, 0);
  });

  it("forwards a valid validate_iban call through the MCP layer unchanged", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    const out = await handleCallTool(c, "validate_iban", { iban: "IT60X0542811101000000123456" });
    assert.deepEqual(out, SAMPLE_RESULT);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.deepEqual(params.arguments, { iban: "IT60X0542811101000000123456" });
  });

  it("forwards a valid calc_imu call through the MCP layer unchanged", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    const out = await handleCallTool(c, "calc_imu", {});
    assert.deepEqual(out, SAMPLE_RESULT);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.equal(params.name, "calc_imu");
  });

  it("treats omitted arguments as an empty object", async () => {
    const upstream = makeUpstream();
    const c = createClient({ fetchFn: upstream.fetchFn, env: {} });
    const out = await handleCallTool(c, "verify_payee", undefined);
    assert.deepEqual(out, SAMPLE_RESULT);
    const params = upstream.calls[2].body.params as Record<string, unknown>;
    assert.deepEqual(params.arguments, {});
  });
});

/* ------------------------------------------------------------------ */

describe("CLI", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

  function runCli(args: string[]) {
    return spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    });
  }

  it("--version prints 0.1.0 and exits 0", () => {
    const res = runCli(["--version"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
    assert.equal(res.stdout.trim(), VERSION);
  });

  it("-v prints 0.1.0 and exits 0", () => {
    const res = runCli(["-v"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
  });

  it("an unknown command prints usage on stderr and exits 2", () => {
    const res = runCli(["not-a-tool"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Usage:/);
  });

  it("a non-JSON argument exits 2", () => {
    const res = runCli(["validate_iban", "not json"]);
    assert.equal(res.status, 2);
  });

  it("a JSON array argument exits 2", () => {
    const res = runCli(["validate_iban", "[]"]);
    assert.equal(res.status, 2);
  });

  it("extra arguments after mcp exit 2", () => {
    const res = runCli(["mcp", "extra"]);
    assert.equal(res.status, 2);
  });
});
