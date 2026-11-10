/**
 * fiscocheck core: a forwarding client for the hosted
 * imperioutils fisco-it MCP server (Italian tax tools).
 *
 * Nothing is computed locally. tools/list is answered
 * from the literal definitions below, taken verbatim
 * from a live capture of the upstream server (name,
 * title, description and inputSchema exactly as
 * captured, title key included; descriptions are in
 * Italian and are served verbatim, not translated).
 * A tools/call travels upstream over a streamable-HTTP
 * JSON-RPC session: an initialize POST, a
 * notifications/initialized POST, then the tools/call
 * POST, carrying the Mcp-Session-Id response header on
 * later requests when the upstream issues one. The
 * session opens lazily on the first forwarded call and
 * is reused for the client's life.
 *
 * The endpoint is pinned to
 * https://imperioutils.com/api/mcp and may be replaced
 * with the IMPERIOUTILS_MCP_URL environment variable
 * (that override is a labelled reconstruction). When
 * IMPERIOUTILS_API_KEY is set, every upstream request
 * carries an `X-API-Key: <key>` header (header name
 * pinned by the registry record's remote declaration;
 * forwarding the key from this env var is a labelled
 * reconstruction, as the capture was taken keyless and
 * the record pins no package env name). When it is
 * unset, no key header goes out.
 *
 * A successful upstream result is returned exactly as
 * received, isError flag and extra fields included.
 * Failures — an upstream JSON-RPC error, a non-2xx
 * status, a body that cannot be parsed, or a fetch that
 * throws or times out — become an isError result whose
 * text begins with `fiscocheck error:` (that rendering
 * is a labelled reconstruction). Replies may be plain
 * JSON or SSE (`data:` lines); the JSON-RPC message
 * whose id matches the request wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://imperioutils.com/api/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/imperioutils-fisco-it-tools-original.json; */
/* generated programmatically by parsing and re-serialising the        */
/* fixture JSON, never retyped)                                        */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "validate_codice_fiscale",
    "title": "Valida Codice Fiscale",
    "description": "Valida un Codice Fiscale italiano (formato + carattere di controllo, con gestione omocodia). Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "codice_fiscale": {
          "type": "string",
          "maxLength": 32,
          "description": "Il Codice Fiscale da validare (es. RSSMRA85T10A562S)."
        }
      },
      "required": [
        "codice_fiscale"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "generate_codice_fiscale",
    "title": "Genera Codice Fiscale",
    "description": "Genera un Codice Fiscale italiano da dati anagrafici (cognome, nome, data di nascita, sesso, e comune/stato estero di nascita — oppure direttamente il codice Belfiore). Restituisce il CF \"base\" (la variante omocodica in caso di collisione è assegnata dall'Agenzia). Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "cognome": {
          "type": "string",
          "maxLength": 64,
          "description": "Cognome."
        },
        "nome": {
          "type": "string",
          "maxLength": 64,
          "description": "Nome."
        },
        "data_nascita": {
          "type": "string",
          "maxLength": 10,
          "description": "Data di nascita in formato GG/MM/AAAA (es. 10/12/1985)."
        },
        "sesso": {
          "type": "string",
          "enum": [
            "M",
            "F"
          ],
          "description": "Sesso: M o F."
        },
        "comune": {
          "type": "string",
          "maxLength": 64,
          "description": "Comune (o stato estero) di nascita. In alternativa usa codice_belfiore."
        },
        "provincia": {
          "type": "string",
          "maxLength": 4,
          "description": "Sigla provincia (es. PI) per disambiguare comuni omonimi."
        },
        "codice_belfiore": {
          "type": "string",
          "maxLength": 4,
          "description": "Codice catastale/Belfiore del luogo di nascita (alternativa precisa al comune)."
        }
      },
      "required": [
        "cognome",
        "nome",
        "data_nascita",
        "sesso"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "validate_partita_iva",
    "title": "Valida Partita IVA",
    "description": "Valida una Partita IVA italiana (11 cifre + checksum Luhn). Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "partita_iva": {
          "type": "string",
          "maxLength": 32,
          "description": "La Partita IVA da validare (11 cifre, es. 12345678903)."
        }
      },
      "required": [
        "partita_iva"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "validate_iban",
    "title": "Valida IBAN",
    "description": "Valida un IBAN (checksum MOD-97) e, per gli IBAN italiani, identifica la banca dal codice ABI. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "iban": {
          "type": "string",
          "maxLength": 64,
          "description": "L'IBAN da validare (es. IT60X0542811101000000123456)."
        }
      },
      "required": [
        "iban"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "lookup_cap",
    "title": "Cerca CAP",
    "description": "Restituisce la provincia del PREFISSO di 2 cifre di un CAP italiano. NON restituisce il comune (il campo `comune` è sempre null: non abbiamo un elenco CAP→comune) e per 14 province — elencate nella risposta in `province_non_rappresentate`, fra cui Lecco, Monza-Brianza, Rimini e Biella — la provincia resa è SBAGLIATA con certezza. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "cap": {
          "type": "string",
          "maxLength": 8,
          "description": "Il CAP a 5 cifre (es. 20121)."
        }
      },
      "required": [
        "cap"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "validate_pec",
    "title": "Valida PEC",
    "description": "Valida un indirizzo PEC italiano: formato + dominio confrontato con l'elenco dei provider certificati AGID (Aruba, InfoCert, Namirial, Poste, ecc.). `is_pec_domain` ha TRE valori: true (nell'elenco AGID), false (non risulta PEC), null (il dominio contiene 'pec' ma NON è stato verificato — non è la stessa cosa di false). Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "maxLength": 254,
          "description": "L'indirizzo PEC da validare (es. mario.rossi@pec.it)."
        }
      },
      "required": [
        "email"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "lookup_ateco",
    "title": "Cerca codice ATECO",
    "description": "Cerca e valida un codice ATECO 2007 ISTAT e restituisce la descrizione dell'attività. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string",
          "pattern": "^[0-9.]{1,12}$",
          "maxLength": 12,
          "description": "Il codice ATECO (solo cifre e punti, es. 62.01)."
        }
      },
      "required": [
        "code"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "search_ateco",
    "title": "Cerca ATECO per attività",
    "description": "Ricerca full-text sui codici ATECO 2007/2022 ISTAT partendo dalla DESCRIZIONE dell'attività (\"fotografo\", \"sviluppo software\", \"commercio abbigliamento\") invece che dal codice. Case/accent-insensitive, con stemming e alias colloquiali per-mestiere; accetta anche un prefisso di codice. Usa questo quando il codice NON è noto — `lookup_ateco` serve al caso opposto (codice noto → descrizione). Risultati ordinati per pertinenza. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "q": {
          "type": "string",
          "minLength": 2,
          "maxLength": 80,
          "description": "Attività da cercare, in italiano (es. 'fotografo', 'idraulico', 'consulenza informatica')."
        },
        "section": {
          "type": "string",
          "pattern": "^[A-Ua-u]$",
          "description": "Filtra per sezione ATECO (lettera A–U, es. J = servizi di informazione e comunicazione, M = attività professionali). Opzionale."
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "description": "Numero massimo di risultati (default 20)."
        }
      },
      "required": [
        "q"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "calc_forfettario",
    "title": "Calcolatore Regime Forfettario",
    "description": "Calcola imposta sostitutiva e contributi INPS del regime forfettario italiano dal fatturato e (opzionale) codice ATECO. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ricavi": {
          "type": "number",
          "minimum": 0,
          "maximum": 10000000,
          "description": "Ricavi/compensi annui in euro."
        },
        "ateco": {
          "type": "string",
          "pattern": "^[0-9.]{1,12}$",
          "maxLength": 12,
          "description": "Codice ATECO da cui derivare il coefficiente di redditività. ALTERNATIVO a `coefficiente`: uno dei due è obbligatorio (senza, il calcolo non ha coefficiente e il tool risponde «Fornire 'ateco' oppure 'coefficiente'»)."
        },
        "coefficiente": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "description": "Coefficiente di redditività in % (override manuale). ALTERNATIVO ad `ateco`: uno dei due è obbligatorio."
        },
        "startup": {
          "type": "boolean",
          "default": false,
          "description": "Aliquota agevolata 5% per le nuove attività: vale per l'anno di inizio e per i quattro successivi (default false → 15%). Non cambia gli acconti: nel primo anno di attività non sono dovuti, e le note della risposta lo dicono."
        },
        "riduzione_35": {
          "type": "boolean",
          "default": false,
          "description": "Riduzione contributiva INPS del 35% (artigiani/commercianti)."
        },
        "gestione_inps": {
          "type": "string",
          "enum": [
            "gestione_separata",
            "artigiani",
            "commercianti",
            "cassa_privata"
          ],
          "description": "Gestione previdenziale INPS/cassa (opzionale)."
        },
        "contributi_cassa_privata": {
          "type": "integer",
          "minimum": 0,
          "maximum": 1000000,
          "description": "Contributi cassa privata già versati, in euro (opzionale)."
        }
      },
      "required": [
        "ricavi"
      ],
      "anyOf": [
        {
          "required": [
            "ateco"
          ]
        },
        {
          "required": [
            "coefficiente"
          ]
        }
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "parse_fatturapa",
    "title": "Parser FatturaPA / SDI",
    "description": "Estrae dati strutturati (cedente, cessionario, righe, imposte) da un XML FatturaPA/SDI. Solo parsing deterministico — nessuna verifica VIES. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "xml_content": {
          "type": "string",
          "maxLength": 64000,
          "description": "Il contenuto XML della fattura elettronica (FatturaPA/SDI)."
        }
      },
      "required": [
        "xml_content"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "parse_verify_fatturapa",
    "title": "FatturaPA: parse + verifica anti-frode del fornitore",
    "description": "Estrae i dati strutturati da un XML FatturaPA/SDI E, nella stessa chiamata, verifica anti-frode la parte indicata (default: il CEDENTE, cioè il fornitore che incassa il bonifico). I dati verificati NON sono inferiti da un LLM: P.IVA, Codice Fiscale, ragione sociale e IBAN di pagamento sono estratti deterministicamente dall'XML, poi passati ai controlli: IBAN (checksum MOD-97 + banca dal codice ABI), P.IVA e CF (checksum) e — quando il servizio UE è raggiungibile — la ragione sociale reale via VIES live, confrontata con quella dichiarata in fattura. Restituisce il parse completo più `supplier_verification` con verdetto (ok / non_verificabile / attenzione / alto_rischio) e red flag puntuali; se la fattura riporta più IBAN distinti lo segnala e abbassa il verdetto. È la difesa contro la truffa del cambio-IBAN sulle fatture passive. Come `verify_payee` fa I/O esterno (una sola interrogazione VIES per chiamata, non una per riga): se VIES è giù o il budget condiviso è esaurito il verdetto degrada ONESTAMENTE ad \"attenzione\", mai a un falso \"ok\". Gratis (€0), nessun login. NON sostituisce la verifica out-of-band (telefonata al fornitore su un numero già noto).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "xml_content": {
          "type": "string",
          "maxLength": 64000,
          "description": "Il contenuto XML della fattura elettronica (FatturaPA/SDI). Il .p7m va scompattato prima: qui si accetta XML testuale."
        },
        "party": {
          "type": "string",
          "enum": [
            "cedente",
            "cessionario"
          ],
          "default": "cedente",
          "description": "Parte da verificare: 'cedente' = fornitore/chi riceve il pagamento (default, il caso anti-frode); 'cessionario' = cliente. L'IBAN viene raccolto solo per il cedente, perché è lui che incassa."
        },
        "expected_country": {
          "type": "string",
          "maxLength": 2,
          "description": "Paese atteso del fornitore in ISO2. Se omesso vale il paese dichiarato dalla fattura stessa (sede del cedente), e solo in sua mancanza 'IT'. Un IBAN estero su un fornitore atteso italiano è il campanello #1 della frode."
        }
      },
      "required": [
        "xml_content"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "calc_iva",
    "title": "Calcola IVA",
    "description": "Calcola l'IVA italiana su un imponibile (aliquote 22/10/5/4/0/esente/fuori campo), con ritenuta d'acconto opzionale (autonomi 20%, agenti 11,5%), e decide la TERRITORIALITÀ delle operazioni con l'estero: beni o servizi, impresa o privato, UE o extra-UE → imponibile in Italia, non imponibile, non soggetta o IVA del paese di destinazione (aliquota ordinaria ufficiale TEDB dei 27 Stati), con Natura FatturaPA, annotazione in fattura e norma. Soglia UE di 10.000 € non dichiarata → due scenari calcolati, mai un numero scelto al posto tuo. Le norme citate seguono la data dell'operazione: DPR 633/72 fino al 31/12/2026, Testo unico IVA dal 1/1/2027. Gestisce le DUE basi imponibili della fattura di un professionista (contributo integrativo cassa solo nella base IVA, rivalsa INPS in entrambe). Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imponibile": {
          "type": "number",
          "minimum": 0.01,
          "maximum": 1000000000000,
          "description": "Compenso/corrispettivo in EUR (es. 1000), AL NETTO del contributo integrativo cassa e della rivalsa INPS: quelli si aggiungono con i due campi dedicati."
        },
        "aliquota_iva": {
          "type": "string",
          "enum": [
            "22",
            "10",
            "5",
            "4",
            "0",
            "esente",
            "fuori_campo"
          ],
          "description": "Aliquota IVA (default 22)."
        },
        "tipo_operazione": {
          "type": "string",
          "enum": [
            "b2b",
            "b2c",
            "intraUE",
            "extraUE",
            "PA"
          ],
          "description": "Tipo operazione (default b2b). intraUE ESIGE `cessionario_soggetto_iva`; verso un privato UE esige anche `oggetto`. extraUE senza `oggetto` è trattata come esportazione di beni (lo dichiara nei `presupposti`); per i servizi dichiara `oggetto` e `cessionario_soggetto_iva`: verso un privato extra-UE l'IVA di regola è italiana."
        },
        "cessionario_soggetto_iva": {
          "type": "boolean",
          "description": "OBBLIGATORIO per tipo_operazione='intraUE' (e per extraUE con oggetto='servizi'). true = soggetto passivo con P.IVA valida al VIES: beni non imponibili (N3.2), servizi non soggetti (N2.1). false = consumatore privato: l'IVA è italiana o del paese di destinazione a seconda di `oggetto`, `vendita_a_distanza`, `soglia_ue_superata` e `tipo_servizio`."
        },
        "con_ritenuta": {
          "type": "boolean",
          "description": "Applica la ritenuta d'acconto (default false)."
        },
        "tipo_ritenuta": {
          "type": "string",
          "enum": [
            "autonomo",
            "agente"
          ],
          "description": "Tipo ritenuta se con_ritenuta=true (autonomo 20% | agente 11,5%)."
        },
        "contributo_integrativo_pct": {
          "type": "number",
          "minimum": 0,
          "maximum": 5,
          "description": "Aliquota % del contributo integrativo della cassa professionale (default 0 = nessuna cassa). Tipicamente 4; 5 per i geometri; 2 per ENPAP/ENPAV — leggila dal regolamento della cassa: il tool non la deduce da ATECO. Entra nella base IVA ma NON in quella della ritenuta."
        },
        "rivalsa_inps_pct": {
          "type": "number",
          "minimum": 0,
          "maximum": 5,
          "description": "Aliquota % della rivalsa INPS gestione separata addebitata in fattura (default 0). Per legge 4 (art. 1 c. 212 L. 662/1996). Entra in ENTRAMBE le basi."
        },
        "oggetto": {
          "type": "string",
          "enum": [
            "beni",
            "servizi"
          ],
          "description": "Per intraUE/extraUE. Cambia il regime: cessione di beni intraUE B2B = non imponibile (N3.2, «operazione non imponibile»); servizi B2B = non soggetti (N2.1, «inversione contabile»). Obbligatorio verso un privato UE."
        },
        "paese_destinazione": {
          "type": "string",
          "pattern": "^[A-Za-z]{2}$",
          "description": "ISO2 del paese del cliente ('EL' Grecia; 'XI' Irlanda del Nord = UE per i soli beni). Serve all'aliquota di destinazione sopra soglia."
        },
        "vendita_a_distanza": {
          "type": "boolean",
          "description": "Beni a privato UE: true se il trasporto è a cura del cedente o per suo conto (default assunto true, e dichiarato). false = il cliente trasporta da sé → IVA italiana."
        },
        "soglia_ue_superata": {
          "type": "boolean",
          "description": "Beni a distanza e servizi elettronici a privati UE: true se vendite a distanza + servizi TTE a privati UE hanno superato 10.000 € (anno precedente o in corso) OPPURE se hai optato per l'IVA di destinazione. Se non la dichiari ricevi DUE scenari calcolati e `iva_importo: null`."
        },
        "tipo_servizio": {
          "type": "string",
          "enum": [
            "generico",
            "elettronico",
            "speciale"
          ],
          "description": "Per oggetto='servizi'. generico = regola generale (default assunto, e dichiarato); elettronico = telecomunicazione, teleradiodiffusione, servizi elettronici; speciale = immobili, trasporti, ristorazione, eventi, noleggio mezzi, intermediazione, lavorazioni su beni mobili — il tool NON calcola il luogo e lo dice, con le norme."
        },
        "servizio_7_septies": {
          "type": "boolean",
          "description": "Servizi a privato extra-UE: true se il servizio è fra quelli dell'art. 7-septies (consulenza, pubblicità, dati, finanziari, personale, noleggio beni mobili…): non soggetto."
        },
        "aliquota_destinazione_pct": {
          "type": "number",
          "minimum": 0,
          "maximum": 30,
          "description": "Aliquota del paese di destinazione, se il bene vi ha un'aliquota RIDOTTA. Senza, si usa l'ordinaria ufficiale (TEDB) e la risposta lo dichiara."
        },
        "data_operazione": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "AAAA-MM-GG, default oggi. Decide la norma citata: DPR 633/72 e DL 331/93 fino al 31/12/2026, Testo unico IVA (D.Lgs. 10/2026) dal 1/1/2027."
        }
      },
      "anyOf": [
        {
          "properties": {
            "tipo_operazione": {
              "enum": [
                "b2b",
                "b2c",
                "PA"
              ]
            }
          }
        },
        {
          "properties": {
            "tipo_operazione": {
              "const": "extraUE"
            },
            "oggetto": {
              "const": "beni"
            }
          },
          "required": [
            "tipo_operazione"
          ]
        },
        {
          "properties": {
            "tipo_operazione": {
              "const": "extraUE"
            },
            "oggetto": {
              "const": "servizi"
            },
            "cessionario_soggetto_iva": {
              "type": "boolean"
            }
          },
          "required": [
            "tipo_operazione",
            "oggetto",
            "cessionario_soggetto_iva"
          ]
        },
        {
          "properties": {
            "tipo_operazione": {
              "const": "intraUE"
            },
            "cessionario_soggetto_iva": {
              "const": true
            }
          },
          "required": [
            "tipo_operazione",
            "cessionario_soggetto_iva"
          ]
        },
        {
          "properties": {
            "tipo_operazione": {
              "const": "intraUE"
            },
            "cessionario_soggetto_iva": {
              "const": false
            },
            "oggetto": {
              "enum": [
                "beni",
                "servizi"
              ]
            }
          },
          "required": [
            "tipo_operazione",
            "cessionario_soggetto_iva",
            "oggetto"
          ]
        }
      ],
      "required": [
        "imponibile"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "calc_reverse_charge",
    "title": "Reverse charge (inversione contabile)",
    "description": "Calcola l'IVA che il CESSIONARIO deve autoliquidare in regime di inversione contabile e restituisce gli obblighi delle due parti con la norma applicabile. Distingue i tre casi che si confondono più spesso: reverse charge INTRACOMUNITARIO (cedente UE non-IT — art. 46 DL 331/93 per i beni, art. 17 c. 2 DPR 633/72 per i servizi), reverse charge INTERNO (cedente italiano — art. 17 c. 6, che NON è generalizzato: vale solo in settori tassativi come subappalti edili, rottami, pulizia edifici, elettronica) e paese non-UE (errore esplicito, non un ramo implicito). Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imponibile": {
          "type": "number",
          "minimum": 0.01,
          "maximum": 1000000000000,
          "description": "Imponibile della fattura in EUR."
        },
        "aliquota_iva": {
          "type": "string",
          "enum": [
            "22",
            "10",
            "5",
            "4",
            "0",
            "esente",
            "fuori_campo"
          ],
          "description": "Aliquota IVA da autoliquidare (default 22)."
        },
        "paese_cedente": {
          "type": "string",
          "pattern": "^[A-Za-z]{2}$",
          "maxLength": 2,
          "description": "Codice ISO2 del paese del CEDENTE: uno Stato membro UE (es. DE, FR, ES; 'EL' o 'GR' per la Grecia; 'XI' per l'Irlanda del Nord) per il reverse charge intracomunitario, oppure 'IT' per quello interno."
        }
      },
      "required": [
        "imponibile",
        "paese_cedente"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "calc_split_payment",
    "title": "Split payment (scissione dei pagamenti)",
    "description": "Calcola la scissione dei pagamenti per le forniture alla Pubblica Amministrazione (art. 17-ter DPR 633/72): il fornitore fattura imponibile + IVA ma incassa dalla PA il SOLO imponibile, mentre l'IVA la versa la PA direttamente all'Erario. Restituisce i due importi separati, l'impatto di liquidità per il fornitore e le istruzioni FatturaPA (EsigibilitaIVA=S; NON si usano i codici Natura N6, che sono solo del reverse charge). Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imponibile": {
          "type": "number",
          "minimum": 0.01,
          "maximum": 1000000000000,
          "description": "Imponibile della fornitura alla PA in EUR."
        },
        "aliquota_iva": {
          "type": "string",
          "enum": [
            "22",
            "10",
            "5",
            "4",
            "0",
            "esente",
            "fuori_campo"
          ],
          "description": "Aliquota IVA esposta in fattura (default 22)."
        }
      },
      "required": [
        "imponibile"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "calc_imu",
    "title": "Calcola IMU",
    "description": "Calcola l'IMU italiana (L.160/2019) per fabbricati (da rendita catastale + categoria), terreni agricoli (da reddito dominicale) e aree edificabili (da valore venale), con acconto/saldo. L'aliquota (‰) è quella deliberata dal Comune: indicala (`aliquota_permille`) OPPURE indica il `comune` (codice catastale o nome) e il server usa l'aliquota del suo prospetto pubblicato dal MEF, con lo stato di legge (prospetto dell'anno · anno precedente, L.160/2019 c.767 · aliquote di base) e la fonte in `aliquota_comune`. Se il prospetto non è ancora stato letto, o il comune non ha l'IMU (Trento, Bolzano, Friuli Venezia Giulia), risponde `calcolato: false` con la spiegazione, senza importo. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "aliquota_permille": {
          "type": "number",
          "minimum": 0,
          "maximum": 15,
          "description": "Aliquota deliberata dal Comune, in per mille (es. 8.6 per 8,6‰). OBBLIGATORIA se non indichi `comune`; con tutti e due vince questa, e la risposta dice se differisce dal prospetto."
        },
        "comune": {
          "type": "string",
          "minLength": 2,
          "maxLength": 120,
          "description": "Codice catastale (es. B519) o nome del comune. L'aliquota diventa quella del suo prospetto IMU pubblicato dal MEF per l'anno (o, per legge, quella dell'anno precedente o di base)."
        },
        "provincia": {
          "type": "string",
          "minLength": 2,
          "maxLength": 2,
          "description": "Sigla della provincia, per i comuni omonimi (es. TO). Solo con `comune`."
        },
        "ex_comune": {
          "type": "string",
          "minLength": 2,
          "maxLength": 120,
          "description": "Solo comuni fusi con aliquote differenziate: l'ex comune dove sta l'immobile. Se serve e manca, la risposta elenca quelli possibili."
        },
        "anno": {
          "type": "integer",
          "minimum": 2025,
          "maximum": 2100,
          "description": "Anno d'imposta del verdetto per comune (default l'anno in corso). Solo con `comune`."
        },
        "tipo_immobile": {
          "type": "string",
          "enum": [
            "abitazione_principale_A1_A8_A9",
            "abitazione_non_principale",
            "immobile_produttivo",
            "immobile_locato_canone_concordato",
            "comodato_uso_parenti",
            "terreno_agricolo",
            "area_edificabile"
          ],
          "description": "Tipo immobile → seleziona la formula (default abitazione_non_principale)."
        },
        "categoria_catastale": {
          "type": "string",
          "enum": [
            "A",
            "A10",
            "B",
            "C1",
            "C2_C6_C7",
            "C3_C4_C5",
            "D",
            "D5",
            "E",
            "F"
          ],
          "description": "Categoria catastale per i fabbricati (default A). Determina il moltiplicatore."
        },
        "rendita_catastale": {
          "type": "number",
          "minimum": 0.01,
          "description": "Fabbricati: rendita catastale annua in euro (da visura). OBBLIGATORIA per tutti i tipi diversi da `terreno_agricolo` e `area_edificabile` — cioè anche per il tipo di default `abitazione_non_principale`."
        },
        "reddito_dominicale": {
          "type": "number",
          "minimum": 0.01,
          "description": "Terreni agricoli: reddito dominicale da visura (base = ×1,25×135). OBBLIGATORIO con `tipo_immobile: terreno_agricolo`, tranne quando il terreno è esente (vedi i due flag)."
        },
        "valore_venale": {
          "type": "number",
          "minimum": 0.01,
          "description": "Aree edificabili: valore venale in comune commercio al 1° gennaio (€). OBBLIGATORIO con `tipo_immobile: area_edificabile`."
        },
        "mesi_possesso": {
          "type": "integer",
          "minimum": 1,
          "maximum": 12,
          "description": "Mesi di possesso nell'anno (default 12)."
        },
        "quota_possesso_pct": {
          "type": "number",
          "minimum": 1,
          "maximum": 100,
          "description": "Quota di possesso in % (default 100)."
        },
        "detrazione": {
          "type": "number",
          "minimum": 0,
          "description": "Detrazione in euro (solo fabbricati; es. 200 per abitazione principale di lusso)."
        },
        "coltivatore_diretto_iap": {
          "type": "boolean",
          "description": "Terreni: coltivatore diretto/IAP iscritto alla previdenza agricola → esente."
        },
        "esente_montano_isola": {
          "type": "boolean",
          "description": "Terreni: in comune montano/collinare o isola minore → esente."
        }
      },
      "required": [],
      "allOf": [
        {
          "if": {
            "not": {
              "required": [
                "comune"
              ]
            }
          },
          "then": {
            "required": [
              "aliquota_permille"
            ]
          }
        }
      ],
      "anyOf": [
        {
          "required": [
            "rendita_catastale"
          ]
        },
        {
          "properties": {
            "tipo_immobile": {
              "const": "terreno_agricolo"
            }
          },
          "required": [
            "reddito_dominicale",
            "tipo_immobile"
          ]
        },
        {
          "properties": {
            "tipo_immobile": {
              "const": "area_edificabile"
            }
          },
          "required": [
            "valore_venale",
            "tipo_immobile"
          ]
        },
        {
          "properties": {
            "tipo_immobile": {
              "const": "terreno_agricolo"
            },
            "coltivatore_diretto_iap": {
              "const": true
            }
          },
          "required": [
            "coltivatore_diretto_iap",
            "tipo_immobile"
          ]
        },
        {
          "properties": {
            "tipo_immobile": {
              "const": "terreno_agricolo"
            },
            "esente_montano_isola": {
              "const": true
            }
          },
          "required": [
            "esente_montano_isola",
            "tipo_immobile"
          ]
        }
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "compose_f24",
    "title": "F24 Precompilato (righe Erario / INPS / IMU)",
    "description": "Compone le RIGHE del modello F24 (sezione Erario, INPS, IMU) con i codici tributo e le causali ufficiali, a partire dagli importi già calcolati: imposta sostitutiva e contributi del regime forfettario (codici tributo 1790 = acconto prima rata, 1791 = acconto seconda rata o unica soluzione, 1792 = saldo; causali INPS PXX = Gestione Separata senza altra copertura, AF = artigiani sul minimale, AP = artigiani sull'eccedenza, CF = commercianti sul minimale, CP = commercianti sull'eccedenza) oppure IMU (3912 = abitazione principale e pertinenze (A/1, A/8, A/9), 3918 = altri fabbricati, 3914 = terreni, 3916 = aree fabbricabili; per il gruppo D 3925 = quota Stato (7,6‰) e 3930 = incremento Comune; con il codice ente catastale del Comune) oppure l'IMPOSTA DI BOLLO sulle fatture elettroniche di un trimestre (2521 = primo trimestre, 2522 = secondo trimestre, 2523 = terzo trimestre, 2524 = quarto trimestre; scadenze 31/05 · 30/09 · 30/11 · 28/02, con la regola di differimento sotto 5.000 €). Per il forfettario la risposta porta anche `regola_acconti`: le due rate al 50% valgono per chi ha un'attività con ISA approvati (anche in forfettario), altrimenti 40% e 60% — con la norma e la base di calcolo. Restituisce righe strutturate (sezione, codice, anno, importo, scadenza indicativa) + una resa testuale. COMPONIBILE: l'input tipico sono gli output di `calc_forfettario` (imposta_sostitutiva.importo, contributi_inps), `calc_imu` (imu_dovuta, acconto_giugno, saldo_dicembre) e `parse_fatturapa` (quante fatture hanno `bollo_analisi.dovuto = true`). NON genera il modello ministeriale F24 — né PDF né facsimile ufficiale: è una compilazione INDICATIVA che non sostituisce il commercialista né la verifica su Agenzia delle Entrate. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "forfettario",
            "imu",
            "bollo"
          ],
          "description": "Dominio da comporre: 'forfettario' (Erario + INPS), 'imu' (sezione IMU e altri tributi locali) oppure 'bollo' (imposta di bollo sulle fatture elettroniche di un trimestre)."
        },
        "bollo": {
          "type": "object",
          "description": "Richiesto quando kind='bollo'. Chiude la catena parse → bollo → F24: conta quante fatture del trimestre risultano soggette a bollo secondo `parse_fatturapa` (campo `bollo_analisi.dovuto` di ciascuna fattura) e componi la riga di versamento.",
          "properties": {
            "trimestre": {
              "type": "integer",
              "minimum": 1,
              "maximum": 4,
              "description": "Trimestre solare di riferimento (1-4). Determina il codice tributo: 2521 = primo trimestre, 2522 = secondo trimestre, 2523 = terzo trimestre, 2524 = quarto trimestre."
            },
            "anno": {
              "type": "integer",
              "minimum": 2019,
              "maximum": 2100,
              "description": "Anno delle fatture (es. 2026). NB: il IV trimestre si versa entro il 28 febbraio dell'anno SUCCESSIVO."
            },
            "numero_fatture": {
              "type": "integer",
              "minimum": 0,
              "maximum": 1000000,
              "description": "Quante fatture del trimestre sono soggette a bollo (2,00 € ciascuna). Alternativo a `importo`: fornire almeno uno dei due."
            },
            "importo": {
              "type": "number",
              "minimum": 0,
              "maximum": 10000000,
              "description": "Importo del bollo già calcolato in euro. Alternativo a `numero_fatture`. Se passi entrambi e non tornano, vince questo e la discrepanza viene segnalata in nota."
            },
            "importo_trimestri_precedenti": {
              "type": "number",
              "minimum": 0,
              "maximum": 10000000,
              "description": "Bollo già dovuto per i trimestri precedenti dello stesso anno (default 0). Serve alla regola di differimento, che guarda il CUMULATO: sotto 5.000 € il versamento del I trimestre può slittare al 30/09 e quello di I+II al 30/11 (art. 3 DL 73/2022). III e IV trimestre non sono mai differibili."
            }
          },
          "required": [
            "trimestre",
            "anno"
          ],
          "anyOf": [
            {
              "required": [
                "numero_fatture"
              ]
            },
            {
              "required": [
                "importo"
              ]
            }
          ],
          "additionalProperties": false
        },
        "forfettario": {
          "type": "object",
          "description": "Richiesto quando kind='forfettario'. Campi dall'output di calc_forfettario.",
          "properties": {
            "imposta": {
              "type": "number",
              "minimum": 0,
              "maximum": 10000000,
              "description": "Imposta sostitutiva dovuta in euro — calc_forfettario → imposta_sostitutiva.importo."
            },
            "gestione_inps": {
              "type": "string",
              "enum": [
                "gestione_separata",
                "artigiani",
                "commercianti",
                "cassa_privata"
              ],
              "description": "Gestione previdenziale (default gestione_separata) — determina le causali INPS (PXX = Gestione Separata senza altra copertura; AF = artigiani sul minimale, AP = artigiani sull'eccedenza; CF = commercianti sul minimale, CP = commercianti sull'eccedenza). Con cassa_privata nessuna riga INPS: i contributi non si versano in F24."
            },
            "inps_fisso": {
              "type": "number",
              "minimum": 0,
              "maximum": 1000000,
              "description": "Contributi INPS sul minimale/fisso in euro — calc_forfettario → contributi_inps.fisso."
            },
            "inps_variabile": {
              "type": "number",
              "minimum": 0,
              "maximum": 1000000,
              "description": "Contributi INPS sull'eccedenza in euro — calc_forfettario → contributi_inps.variabile."
            },
            "inps_totale": {
              "type": "number",
              "minimum": 0,
              "maximum": 1000000,
              "description": "Totale contributi INPS in euro — calc_forfettario → contributi_inps.importo. Usato solo se fisso/variabile non sono forniti."
            },
            "startup": {
              "type": "boolean",
              "default": false,
              "description": "Primo anno di attività: nessun acconto, si versa solo il saldo. Non è l'aliquota del 5% (che vale cinque anni): qui l'imposta arriva già calcolata."
            },
            "anno": {
              "type": "integer",
              "minimum": 2015,
              "maximum": 2100,
              "description": "Anno d'imposta di riferimento (es. 2026)."
            }
          },
          "required": [
            "imposta",
            "anno"
          ],
          "additionalProperties": false
        },
        "imu": {
          "type": "object",
          "description": "Richiesto quando kind='imu'. Campi dall'output di calc_imu.",
          "properties": {
            "imu_dovuta": {
              "type": "number",
              "minimum": 0,
              "maximum": 10000000,
              "description": "IMU annua dovuta in euro — calc_imu → imu_dovuta."
            },
            "acconto": {
              "type": "number",
              "minimum": 0,
              "maximum": 10000000,
              "description": "Acconto di giugno in euro — calc_imu → acconto_giugno."
            },
            "saldo": {
              "type": "number",
              "minimum": 0,
              "maximum": 10000000,
              "description": "Saldo di dicembre in euro — calc_imu → saldo_dicembre."
            },
            "base_imponibile": {
              "type": "number",
              "minimum": 0,
              "description": "Base imponibile in euro — calc_imu → base_imponibile. Serve allo split del gruppo D."
            },
            "aliquota_permille": {
              "type": "number",
              "minimum": 0,
              "maximum": 20,
              "description": "Aliquota deliberata dal Comune in per mille — calc_imu → parametri.aliquota_permille. Serve allo split gruppo D (7,6‰ Stato + eccedenza Comune)."
            },
            "tipo_immobile": {
              "type": "string",
              "enum": [
                "abitazione_principale_A1_A8_A9",
                "abitazione_non_principale",
                "immobile_produttivo",
                "immobile_locato_canone_concordato",
                "comodato_uso_parenti",
                "terreno_agricolo",
                "area_edificabile"
              ],
              "description": "Tipo immobile — calc_imu → parametri.tipo_immobile. Determina il codice tributo IMU."
            },
            "categoria_catastale": {
              "type": "string",
              "enum": [
                "A",
                "A10",
                "B",
                "C1",
                "C2_C6_C7",
                "C3_C4_C5",
                "D",
                "D5",
                "E",
                "F"
              ],
              "description": "Categoria catastale (default A) — calc_imu → parametri.categoria_catastale."
            },
            "codice_comune": {
              "type": "string",
              "pattern": "^[A-Za-z][0-9]{3}$",
              "maxLength": 4,
              "description": "Codice catastale/Belfiore del Comune = codice ente F24 (1 lettera + 3 cifre, es. H501 per Roma)."
            },
            "anno": {
              "type": "integer",
              "minimum": 2012,
              "maximum": 2100,
              "description": "Anno d'imposta di riferimento (es. 2026)."
            }
          },
          "required": [
            "imu_dovuta",
            "acconto",
            "saldo",
            "tipo_immobile",
            "codice_comune",
            "anno"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "kind"
      ],
      "allOf": [
        {
          "if": {
            "properties": {
              "kind": {
                "const": "forfettario"
              }
            },
            "required": [
              "kind"
            ]
          },
          "then": {
            "required": [
              "forfettario"
            ]
          }
        },
        {
          "if": {
            "properties": {
              "kind": {
                "const": "imu"
              }
            },
            "required": [
              "kind"
            ]
          },
          "then": {
            "required": [
              "imu"
            ]
          }
        },
        {
          "if": {
            "properties": {
              "kind": {
                "const": "bollo"
              }
            },
            "required": [
              "kind"
            ]
          },
          "then": {
            "required": [
              "bollo"
            ]
          }
        }
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "intrastat_periodicity",
    "title": "INTRASTAT: periodicità e scadenza di presentazione",
    "description": "Determina se un soggetto deve presentare l'elenco riepilogativo INTRASTAT e con quale periodicità (mensile / trimestrale / nessun obbligo), a partire dagli ammontari dei quattro trimestri precedenti, e calcola la SCADENZA del periodo (giorno 25 del mese successivo, con slittamento se cade di sabato, domenica o festività nazionale italiana). Ogni flusso ha soglia e criterio propri, e li restituisce insieme alla FONTE normativa: cessioni di beni e servizi resi € 50.000 con criterio di SUPERAMENTO (>) → mensile se superata, altrimenti trimestrale; acquisti di servizi € 100.000 e acquisti di beni € 2.000.000 (soglia innalzata da € 350.000 dal periodo di riferimento 01/2026, Det. ADM 84415 del 03/02/2026) con criterio UGUALE O SUPERIORE (>=) → mensile se raggiunta, altrimenti NESSUN obbligo (per gli acquisti la periodicità trimestrale è stata abrogata). L'asimmetria > / >= è voluta e rispecchia le fonti. Indicativo: non sostituisce il commercialista o il doganalista. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "flusso": {
          "type": "string",
          "enum": [
            "cessioni",
            "acquisti"
          ],
          "description": "'cessioni' = operazioni attive, modelli INTRA-1 (beni ceduti / servizi resi); 'acquisti' = operazioni passive, modelli INTRA-2 (beni acquistati / servizi ricevuti)."
        },
        "categoria": {
          "type": "string",
          "enum": [
            "beni",
            "servizi"
          ],
          "description": "Categoria delle operazioni. Soglia e sezione del modello dipendono da questa."
        },
        "anno": {
          "type": "integer",
          "minimum": 2022,
          "maximum": 2100,
          "description": "Anno del periodo di RIFERIMENTO (non dell'invio). I modelli vigenti decorrono dal 2022. Determina quale soglia INTRA-2bis si applica (2.000.000 dal 2026)."
        },
        "mese": {
          "type": "integer",
          "minimum": 1,
          "maximum": 12,
          "description": "Mese del periodo di riferimento (1–12). Se la periodicità risulta trimestrale, il trimestre viene dedotto da questo mese."
        },
        "ammontari_trimestri_precedenti": {
          "type": "array",
          "items": {
            "type": "number",
            "minimum": 0
          },
          "minItems": 1,
          "maxItems": 4,
          "description": "Ammontari in EURO dei quattro trimestri PRECEDENTI per quel flusso+categoria, ordinati dal più recente al più remoto (es. [62000, 41000, 38000, 35000]). Ammessi da 1 a 4 valori: chi ha iniziato da poco ne ha meno, e la risposta lo segnala nelle note. La soglia si valuta sul MASSIMO, non sulla somma."
        }
      },
      "required": [
        "flusso",
        "categoria",
        "anno",
        "mese",
        "ammontari_trimestri_precedenti"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "intrastat_compose",
    "title": "INTRASTAT: composizione e validazione delle sezioni",
    "description": "Compone le SEZIONI dell'elenco riepilogativo INTRASTAT a partire dalle righe di operazione, assegnando ciascuna riga alla sezione corretta (INTRA-1bis cessioni di beni, 1ter rettifiche, 1quater servizi resi, 1quinquies rettifiche, 1sexies call-off stock; INTRA-2bis acquisti di beni, 2ter, 2quater servizi ricevuti, 2quinquies) e VALIDANDOLE: Stato membro ammesso (l'Irlanda del Nord XI vale solo per i BENI; San Marino e Regno Unito sono fuori ambito), partita IVA della controparte (formato per Stato membro + checksum per quelle italiane), nomenclatura combinata a 8 cifre (o il codice semplificato 99500000), formato della natura della transazione e campi obbligatori per sezione. Restituisce le sezioni popolate, i totali, la scadenza e un prospetto testuale di controllo. ⚠️ NON genera il file TELEMATICO per il Servizio Telematico Doganale (Intr@Web / ADM): il tracciato record ufficiale non è riproducibile da fonte pubblica verificabile, quindi non è stato inventato. Quello che ottieni è struttura-dati + prospetto, da riportare sul canale ufficiale. Nessun default silenzioso: un dato obbligatorio mancante produce un errore esplicito, mai un riempimento arbitrario. Le partite IVA sono validate OFFLINE (formato e checksum): per la verifica VIES live della controparte usa `verify_payee`. Determina prima la periodicità con `intrastat_periodicity`. Indicativo, non sostituisce il commercialista o il doganalista. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "anno": {
          "type": "integer",
          "minimum": 2022,
          "maximum": 2100,
          "description": "Anno del periodo di riferimento (i modelli vigenti decorrono dal 2022)."
        },
        "mese": {
          "type": "integer",
          "minimum": 1,
          "maximum": 12,
          "description": "Mese del periodo di riferimento (1–12). Con periodicità trimestrale individua il trimestre."
        },
        "periodicita": {
          "type": "string",
          "enum": [
            "mensile",
            "trimestrale",
            "nessun_obbligo"
          ],
          "default": "mensile",
          "description": "Periodicità dell'elenco — determinala con `intrastat_periodicity`. Con 'nessun_obbligo' la chiamata viene RIFIUTATA con una spiegazione: sotto soglia l'elenco non va presentato."
        },
        "partita_iva_dichiarante": {
          "type": "string",
          "maxLength": 16,
          "description": "Partita IVA italiana del soggetto obbligato (11 cifre, opzionale). Se fornita viene validata col checksum."
        },
        "righe": {
          "type": "array",
          "minItems": 1,
          "maxItems": 25,
          "description": "Righe di operazione da riepilogare. Massimo 25 sulla superficie anonima (l'API autenticata non ha questo limite). Righe di flussi/categorie diversi possono coesistere: ognuna finisce nella sua sezione.",
          "items": {
            "type": "object",
            "properties": {
              "flusso": {
                "type": "string",
                "enum": [
                  "cessioni",
                  "acquisti"
                ],
                "description": "cessioni = INTRA-1 (attive) · acquisti = INTRA-2 (passive)."
              },
              "categoria": {
                "type": "string",
                "enum": [
                  "beni",
                  "servizi"
                ],
                "description": "Determina quali campi sono obbligatori: i campi BENI e i campi SERVIZI si escludono."
              },
              "rettifica": {
                "type": "boolean",
                "default": false,
                "description": "True se la riga rettifica un periodo PRECEDENTE → sezioni ter/quinquies. Richiede `anno_riferimento_rettifica`. Solo sulle rettifiche è ammesso un ammontare negativo."
              },
              "call_off_stock": {
                "type": "boolean",
                "default": false,
                "description": "Solo cessioni di BENI: regime call-off stock (art. 17-bis Dir. 2006/112/CE) → sezione INTRA-1sexies."
              },
              "paese_controparte": {
                "type": "string",
                "minLength": 2,
                "maxLength": 2,
                "description": "Codice ISO2 dello Stato membro della controparte (es. DE, FR, ES; EL per la Grecia, non GR). 'XI' (Irlanda del Nord) è ammesso SOLO per i beni. SM (San Marino) e GB sono fuori ambito e vengono rifiutati."
              },
              "partita_iva_controparte": {
                "type": "string",
                "maxLength": 24,
                "description": "Partita IVA della controparte, con o senza prefisso paese (es. DE123456789 o 123456789). Validata sul formato dello Stato membro; per le italiane anche col checksum. Nessuna interrogazione VIES."
              },
              "ammontare": {
                "type": "number",
                "description": "Ammontare delle operazioni in EURO. Negativo ammesso solo se rettifica=true."
              },
              "nomenclatura_combinata": {
                "type": "string",
                "pattern": "^\\d{8}$",
                "maxLength": 8,
                "description": "Solo BENI: codice NC a 8 cifre. Per spedizioni di valore inferiore a € 1.000 è ammesso il codice unico 99500000. Se ne valida il FORMATO, non l'esistenza nella NC dell'anno (la tabella NC è annuale e non è in repository)."
              },
              "massa_netta_kg": {
                "type": "number",
                "minimum": 0,
                "description": "Solo BENI: massa netta in kg."
              },
              "paese_origine": {
                "type": "string",
                "minLength": 2,
                "maxLength": 2,
                "description": "Solo BENI: paese di origine della merce (ISO2)."
              },
              "paese_destinazione": {
                "type": "string",
                "minLength": 2,
                "maxLength": 2,
                "description": "Solo BENI: paese di destinazione/provenienza della merce (ISO2)."
              },
              "natura_transazione": {
                "type": "string",
                "maxLength": 2,
                "description": "Solo BENI: codice natura della transazione — 1 cifra (colonna A) oppure 2 cifre (colonne A+B, obbligatorie oltre € 20.000.000 di scambi nell'anno precedente). Si valida SOLO il formato: le descrizioni dei codici sono l'Allegato XI alla Det. ADM 493869/RU/2021, non riproducibile da fonte testuale verificabile, e non vengono inventate."
              },
              "codice_servizio": {
                "type": "string",
                "pattern": "^\\d{6}$",
                "maxLength": 6,
                "description": "Solo SERVIZI: codice CPA a 6 cifre. Validato nel formato, non l'esistenza in tabella CPA."
              },
              "modalita_erogazione": {
                "type": "string",
                "enum": [
                  "I",
                  "R"
                ],
                "description": "Solo SERVIZI: 'I' istantanea · 'R' a più riprese."
              },
              "modalita_incasso": {
                "type": "string",
                "enum": [
                  "B",
                  "A",
                  "X"
                ],
                "description": "Solo SERVIZI: 'B' bonifico · 'A' accredito · 'X' altro."
              },
              "anno_riferimento_rettifica": {
                "type": "integer",
                "minimum": 2022,
                "maximum": 2100,
                "description": "Obbligatorio se rettifica=true: anno del periodo rettificato."
              },
              "riferimento": {
                "type": "string",
                "maxLength": 64,
                "description": "Riferimento libero (es. numero fattura). Serve solo alla tua tracciabilità: non fa parte dell'elenco."
              }
            },
            "required": [
              "flusso",
              "categoria",
              "paese_controparte",
              "partita_iva_controparte",
              "ammontare"
            ],
            "allOf": [
              {
                "if": {
                  "properties": {
                    "categoria": {
                      "const": "beni"
                    }
                  },
                  "required": [
                    "categoria"
                  ]
                },
                "then": {
                  "required": [
                    "nomenclatura_combinata"
                  ]
                }
              },
              {
                "if": {
                  "properties": {
                    "categoria": {
                      "const": "servizi"
                    }
                  },
                  "required": [
                    "categoria"
                  ]
                },
                "then": {
                  "required": [
                    "codice_servizio",
                    "modalita_erogazione",
                    "modalita_incasso"
                  ]
                }
              },
              {
                "if": {
                  "properties": {
                    "rettifica": {
                      "const": true
                    }
                  },
                  "required": [
                    "rettifica"
                  ]
                },
                "then": {
                  "required": [
                    "anno_riferimento_rettifica"
                  ]
                }
              }
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "anno",
        "mese",
        "righe"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "intrastat_reference",
    "title": "INTRASTAT: tabelle di riferimento e soglie vigenti",
    "description": "Restituisce, senza alcun input, le tabelle di riferimento INTRASTAT: gli Stati membri ammessi con i loro codici, il caso dell'Irlanda del Nord (XI, solo beni) e i paesi fuori ambito (San Marino dal 01/10/2021, Regno Unito dal 01/01/2021), tutte le sezioni dei modelli con la loro descrizione, e OGNI soglia vigente con importo, criterio di confronto (> oppure >=), effetto e FONTE normativa puntuale — inclusa la soglia acquisti di beni innalzata a € 2.000.000 dal periodo 01/2026 (Det. ADM 84415 del 03/02/2026). Include anche il termine di presentazione e l'elenco ESPLICITO di ciò che questi strumenti NON producono (il file telematico ADM, le descrizioni dei codici natura della transazione, la verifica VIES live). Usalo per validare gli input prima di `intrastat_compose`, per popolare un form, o per citare la fonte di una soglia invece di ricordarla a memoria. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    }
  },
  {
    "name": "nis2_tipologie",
    "title": "NIS2: elenco ufficiale delle tipologie di soggetto",
    "description": "Elenco ufficiale delle tipologie di soggetto degli allegati I–IV del D.Lgs. 4 settembre 2024 n. 138 (recepimento NIS2), verbatim dal testo di Gazzetta Ufficiale, con ricerca testuale. Serve a trovare il `tipologia_id` da passare a `nis2_ambito`. ⚠️ NON esiste alcuna mappa codice ATECO → tipologia, e questo strumento non ne usa una: la dichiarazione sulla piattaforma ACN (art. 11 c. 2 della determinazione ACN 127437/2026) tiene i codici ATECO e le tipologie di soggetto SEPARATI, e l'ambito si determina sulla TIPOLOGIA, definita per rinvio a una norma UE. Dedurre l'ambito NIS2 da un codice ATECO significa applicare una regola che la fonte non contiene. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "q": {
          "type": "string",
          "maxLength": 120,
          "description": "Ricerca testuale su testo della tipologia, settore e sottosettore (accenti e maiuscole ignorati; tutti i termini devono comparire). Es. 'cloud', 'energia elettrica', 'rifiuti'. Vuoto = tutto il catalogo."
        },
        "allegato": {
          "type": "string",
          "enum": [
            "I",
            "II",
            "III",
            "IV"
          ],
          "description": "Filtra per allegato. I = settori ad alta criticità (51 tipologie); II = altri settori critici (15); III = pubbliche amministrazioni (15); IV = ulteriori tipologie, che rientrano solo se individuate dall'ACN (4)."
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 200,
          "description": "Numero massimo di risultati (default 200)."
        }
      },
      "required": [],
      "additionalProperties": false
    }
  },
  {
    "name": "nis2_ambito",
    "title": "NIS2: ambito di applicazione e categoria del soggetto",
    "description": "Dice se un soggetto rientra nel campo di applicazione del D.Lgs. 138/2024 (NIS2) e se è soggetto ESSENZIALE o IMPORTANTE, citando ARTICOLO E COMMA per ogni passo del ragionamento. Quando manca un dato che cambierebbe la risposta restituisce `esito: \"indeterminato\"` e la DOMANDA da porre, invece di una risposta inventata. Le regole su cui si sbaglia più spesso, tutte applicate qui: (1) la soglia di INGRESSO è quella della PICCOLA impresa, non della media — si è dentro con occupati >= 50 OPPURE (fatturato > 10 M€ E bilancio > 10 M€) — quindi l'ambito è molto più largo di come viene raccontato; (2) per superare un massimale servono gli occupati sopra soglia OPPURE ENTRAMBI i valori finanziari sopra soglia: 30 dipendenti con 12 M€ di fatturato e 8 M€ di bilancio è ancora PICCOLA, quindi FUORI; (3) l'art. 3 §4 della raccomandazione 2003/361/CE è DISAPPLICATO (art. 3 c. 3): una partecipazione pubblica pari o superiore al 25% non fa perdere lo stato di PMI; (4) un soggetto dell'allegato II non è MAI essenziale per dimensione — l'art. 6 c. 1 lett. a) cita solo l'allegato I — nemmeno con migliaia di dipendenti. Non registra nulla presso l'ACN: è il pre-volo della dichiarazione, la cui valutazione preliminare è svolta automaticamente dalla piattaforma ACN (art. 11 c. 6 della determinazione ACN 127437/2026); l’inserimento o meno nell'elenco dei soggetti NIS lo comunica poi l'ACN (art. 15 c. 3 della determinazione). Indicativo, non è un parere legale. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "tipologia_id": {
          "type": "string",
          "maxLength": 32,
          "description": "Id della tipologia dall'elenco ufficiale — ottienilo con `nis2_tipologie`. Es. 'I.1.a.1' (impresa elettrica), 'III.a.2' (Ministeri). NON è un codice ATECO."
        },
        "occupati": {
          "type": "integer",
          "minimum": 0,
          "description": "Numero di occupati (unità lavorative-anno)."
        },
        "fatturato_eur": {
          "type": "number",
          "minimum": 0,
          "description": "Fatturato annuo in euro."
        },
        "bilancio_eur": {
          "type": "number",
          "minimum": 0,
          "description": "Totale di bilancio annuo in euro."
        },
        "impresa_autonoma": {
          "type": "boolean",
          "description": "false se il soggetto ha imprese collegate o associate: l'art. 3 c. 4 impone allora il consolidamento ex art. 6 §2 della raccomandazione. Omettilo se non lo sai — lo strumento chiede. Un superamento già visibile sui dati individuali resta valido (il consolidamento può solo aumentare i valori); un NON superamento no."
        },
        "dati_consolidati": {
          "type": "boolean",
          "description": "true se i valori dimensionali forniti sono GIÀ consolidati di gruppo."
        },
        "soggetto_critico_cer": {
          "type": "boolean",
          "description": "true se il soggetto è identificato come soggetto critico ai sensi del decreto che recepisce la direttiva (UE) 2022/2557 (CER): rientra ed è ESSENZIALE a prescindere dalla dimensione (art. 3 c. 5 lett. a; art. 6 c. 1 lett. b)."
        },
        "prestatore_fiduciario_qualificato": {
          "type": "boolean",
          "description": "Solo per i prestatori di servizi fiduciari: i QUALIFICATI sono essenziali a prescindere dalla dimensione (art. 6 c. 1 lett. d), i non qualificati no."
        },
        "individuato_da_acn": {
          "type": "boolean",
          "description": "true se l'Autorità nazionale competente NIS ha notificato l'individuazione (art. 3 c. 13). Per l'allegato IV è LA condizione dell'ambito: senza, non è auto-valutabile e lo strumento lo dichiara invece di indovinare."
        },
        "criteri_impresa_collegata": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "a",
              "b",
              "c",
              "d"
            ]
          },
          "maxItems": 4,
          "description": "Lettere dell'art. 3 c. 10 soddisfatte quando il soggetto è impresa collegata a un soggetto essenziale o importante: a) influenza dominante sulle decisioni relative alle misure di gestione del rischio; b) detiene o gestisce i sistemi da cui dipende la fornitura del servizio; c) ne effettua le operazioni di sicurezza informatica; d) gli fornisce servizi TIC o di sicurezza. Anche una sola lettera lo fa rientrare a prescindere dalla dimensione."
        }
      },
      "required": [
        "tipologia_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "nis2_reference",
    "title": "NIS2: soglie, regole e fonti",
    "description": "Restituisce, senza alcun input, le soglie dimensionali NIS2 con la formula esatta di superamento e la fonte (raccomandazione 2003/361/CE, allegato, art. 2 §1 e §2, riprodotto testualmente nelle note all'art. 6 in Gazzetta Ufficiale), la regola di ogni comma rilevante dell'art. 3 e dell'art. 6, i quattro criteri dell'impresa collegata, la finestra di registrazione sulla piattaforma ACN (dal 1° gennaio al 28 febbraio di OGNI anno: è ricorrente, non una scadenza singola) e l'elenco ESPLICITO di ciò che questo dominio NON copre. Include il caso dei settori 3 e 4 dell'allegato I (bancario e infrastrutture dei mercati finanziari), per i quali l'art. 3 c. 14 sostituisce l'art. 17 e i Capi IV e V con il regolamento (UE) 2022/2554 (DORA). Usalo per citare la fonte di una soglia invece di ricordarla a memoria. Gratis (€0), deterministico, nessun login richiesto.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    }
  },
  {
    "name": "verify_payee",
    "title": "Verifica Fornitore (anti-frode pre-pagamento)",
    "description": "Verifica anti-frode di un beneficiario PRIMA di pagare una fattura (contro la truffa del cambio-IBAN / Business Email Compromise). Controlli: IBAN (checksum MOD-97 + banca dal codice ABI), Partita IVA e Codice Fiscale (checksum), e — quando il servizio UE è raggiungibile — la ragione sociale reale via VIES live con match sul nome atteso. Restituisce un verdetto (ok / non_verificabile / attenzione / alto_rischio) + i red flag puntuali. `non_verificabile` = nessun segnale di frode MA nessuna fonte autorevole ha confermato chi sia il fornitore (P.IVA italiana non iscritta al VIES, o nessuna P.IVA fornita): non è un allarme, è il rifiuto di dire «ok» su un soggetto non identificato. A differenza degli altri strumenti fa I/O esterno (VIES): se VIES è giù o il budget di verifica è temporaneamente esaurito, il verdetto degrada ONESTAMENTE ad \"attenzione\" (mai un falso \"ok\"). Gratis (€0), nessun login. NON sostituisce la verifica out-of-band (telefonata al fornitore su un numero già noto).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "iban": {
          "type": "string",
          "maxLength": 64,
          "description": "IBAN del beneficiario (es. IT60X0542811101000000123456)."
        },
        "vat_number": {
          "type": "string",
          "maxLength": 32,
          "description": "Partita IVA con o senza prefisso paese (es. IT12345678901)."
        },
        "codice_fiscale": {
          "type": "string",
          "maxLength": 32,
          "description": "Codice Fiscale (persona fisica / ditta individuale)."
        },
        "expected_name": {
          "type": "string",
          "maxLength": 140,
          "description": "Ragione sociale attesa del fornitore, confrontata con quella ufficiale VIES."
        },
        "expected_country": {
          "type": "string",
          "maxLength": 2,
          "description": "Paese atteso del fornitore in ISO2 (default IT). Un IBAN estero è il campanello #1 della frode."
        },
        "ateco": {
          "type": "string",
          "pattern": "^[0-9.]{1,12}$",
          "maxLength": 12,
          "description": "Codice ATECO dichiarato del fornitore (solo cifre e punti, opzionale)."
        }
      },
      "required": [],
      "anyOf": [
        {
          "required": [
            "iban"
          ]
        },
        {
          "required": [
            "vat_number"
          ]
        },
        {
          "required": [
            "codice_fiscale"
          ]
        }
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "guardian_list_suppliers",
    "title": "Fornitori sorvegliati",
    "description": "Elenca i fornitori che questo account sta sorvegliando, con lo stato della verifica VIES piu' recente e quanti IBAN risultano confermati o in attesa di conferma. Gli IBAN sono restituiti MASCHERATI. Richiede una API key (account gratuito su https://imperioutils.com/signup). Non consuma crediti.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "only_alerting": {
          "type": "boolean",
          "description": "Se true, restituisce solo i fornitori che meritano attenzione: IBAN in attesa di conferma, oppure ultima verifica VIES non superata."
        }
      },
      "additionalProperties": false
    }
  },
  {
    "name": "guardian_supplier_ledger",
    "title": "Libretto IBAN di un fornitore",
    "description": "Lo storico degli IBAN visti per un fornitore: quali sono confermati, quali sono in attesa di conferma umana, quali sono stati rifiutati, e da quando. E' la memoria contro cui si giudica un IBAN nuovo. Gli IBAN sono MASCHERATI (paese, banca, ultime 4 cifre). Richiede una API key (account gratuito su https://imperioutils.com/signup). Non consuma crediti.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "partita_iva": {
          "type": "string",
          "maxLength": 20,
          "description": "Partita IVA del fornitore (con o senza prefisso IT)."
        },
        "codice_fiscale": {
          "type": "string",
          "maxLength": 20,
          "description": "Codice Fiscale del fornitore."
        }
      },
      "anyOf": [
        {
          "required": [
            "partita_iva"
          ]
        },
        {
          "required": [
            "codice_fiscale"
          ]
        }
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "guardian_supplier_status",
    "title": "Stato di sorveglianza di un fornitore",
    "description": "Dice se un fornitore e' sorvegliato da questo account e come e' andata l'ultima verifica: esito VIES, se la risposta era autorevole, da quando non se ne ottiene una, e le eventuali anomalie rilevate. Richiede una API key (account gratuito su https://imperioutils.com/signup). Non consuma crediti.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "partita_iva": {
          "type": "string",
          "maxLength": 20,
          "description": "Partita IVA del fornitore (con o senza prefisso IT)."
        },
        "codice_fiscale": {
          "type": "string",
          "maxLength": 20,
          "description": "Codice Fiscale del fornitore."
        }
      },
      "anyOf": [
        {
          "required": [
            "partita_iva"
          ]
        },
        {
          "required": [
            "codice_fiscale"
          ]
        }
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "guardian_check_iban",
    "title": "Confronta un IBAN col libretto del fornitore",
    "description": "Il gesto anti-BEC: confronta l'IBAN letto su una fattura con lo storico di quel fornitore e dice se e' gia' confermato, gia' visto ma mai confermato, o MAI VISTO. ATTENZIONE, questo strumento MODIFICA lo stato: un IBAN mai visto viene registrato come \"in attesa di conferma\" e all'intestatario dell'account parte un'email di avviso. La conferma di un IBAN NON e' esposta agli agenti: e' un atto che richiede una persona, e si compie su https://imperioutils.com/tools/supplier-monitors. Richiede una API key (account gratuito su https://imperioutils.com/signup). Non consuma crediti.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "iban": {
          "type": "string",
          "maxLength": 40,
          "description": "IBAN riportato sul documento da pagare."
        },
        "partita_iva": {
          "type": "string",
          "maxLength": 20,
          "description": "Partita IVA del fornitore (con o senza prefisso IT)."
        },
        "codice_fiscale": {
          "type": "string",
          "maxLength": 20,
          "description": "Codice Fiscale del fornitore."
        }
      },
      "required": [
        "iban"
      ],
      "anyOf": [
        {
          "required": [
            "partita_iva"
          ]
        },
        {
          "required": [
            "codice_fiscale"
          ]
        }
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "guardian_watch_supplier",
    "title": "Metti dei fornitori sotto sorveglianza",
    "description": "Registra uno o piu' fornitori nel guardiano, perche' i loro cambi di IBAN e le variazioni VIES vengano intercettati dalle verifiche notturne. Gli IBAN indicati entrano nel libretto come \"in attesa di conferma\", MAI come confermati: un IBAN letto su un documento non e' una baseline. Cio' che resta fuori (piano pieno, gia' sorvegliato, identita' assente) viene restituito contato e motivato. Richiede una API key (account gratuito su https://imperioutils.com/signup). Non consuma crediti.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "suppliers": {
          "type": "array",
          "minItems": 1,
          "maxItems": 100,
          "description": "I fornitori da sorvegliare. Per ciascuno serve la Partita IVA oppure il Codice Fiscale.",
          "items": {
            "type": "object",
            "properties": {
              "partita_iva": {
                "type": "string",
                "maxLength": 20,
                "description": "Partita IVA del fornitore (con o senza prefisso IT)."
              },
              "codice_fiscale": {
                "type": "string",
                "maxLength": 20,
                "description": "Codice Fiscale del fornitore."
              },
              "expected_name": {
                "type": "string",
                "maxLength": 160,
                "description": "Ragione sociale attesa."
              },
              "expected_country": {
                "type": "string",
                "maxLength": 2,
                "description": "Paese ATTESO del fornitore (ISO-2). Se omesso vale IT. E' il paese contro cui si giudica un IBAN estero: dichiararlo evita avvisi fabbricati su fornitori legittimamente stranieri."
              },
              "label": {
                "type": "string",
                "maxLength": 160,
                "description": "Etichetta libera."
              },
              "iban": {
                "type": "string",
                "maxLength": 40,
                "description": "IBAN letto sul documento. Entra nel libretto come \"in attesa di conferma\"."
              }
            },
            "anyOf": [
              {
                "required": [
                  "partita_iva"
                ]
              },
              {
                "required": [
                  "codice_fiscale"
                ]
              }
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "suppliers"
      ],
      "additionalProperties": false
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` belongs to the captured surface. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `fiscocheck error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Read a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * present, otherwise the last parseable message, otherwise
 * null when nothing in the body parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not a JSON payload; skip this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client that holds a single upstream
 * session, opened lazily on first use and reused from
 * then on (for the process lifetime in the MCP server,
 * or for a single invocation in the CLI).
 */
export class FiscocheckClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).IMPERIOUTILS_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private apiKey(): string | null {
    const raw = (this.deps.env ?? process.env).IMPERIOUTILS_API_KEY;
    if (raw && raw.trim() !== "") return raw.trim();
    return null;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = this.apiKey();
    if (key !== null) headers["X-API-Key"] = key;
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "fiscocheck", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // Nothing needed from the notification response body.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Hand the upstream result back exactly as received.
    return result;
  }
}

/** Build a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): FiscocheckClient {
  return new FiscocheckClient(deps);
}

/** One-shot helper: a fresh client for a single call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new FiscocheckClient(deps).callTool(name, args);
}
