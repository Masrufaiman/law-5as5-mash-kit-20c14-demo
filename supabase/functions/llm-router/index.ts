import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ──────────────────────────────────────────────
// Server-side AES-GCM decryption
// ──────────────────────────────────────────────
async function decryptApiKey(encryptedHex: string, ivHex: string): Promise<string> {
  // Guard: skip decryption if inputs are missing or invalid
  if (!encryptedHex || !ivHex || ivHex.length < 2) return "";
  try {
    const ivBytes = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    // AES-GCM requires IV of 12 or 16 bytes
    if (ivBytes.length !== 12 && ivBytes.length !== 16) {
      console.error(`Invalid IV length: ${ivBytes.length} (expected 12 or 16)`);
      return "";
    }
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "PBKDF2" }, false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: new TextEncoder().encode("lawkit-api-key-enc"), iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("decryptApiKey failed:", e);
    return "";
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface ChatRequest {
  conversationId: string;
  message: string;
  vaultId?: string;
  deepResearch?: boolean;
  attachedFileIds?: string[];
  attachedFileNames?: string[];
  sources?: string[];
  history?: { role: string; content: string }[];
  useCase?: string;
  vaultName?: string;
  promptMode?: string;
  currentSheetState?: any;
  workflowSystemPrompt?: string;
  currentDocumentContent?: string;
  columnMeta?: { name: string; type: string; query: string };
  fileNames?: string[];
  existingSheet?: any;
}

interface ToolResult {
  context: string;
  citations: { index: number; source: string; excerpt: string; url?: string }[];
  domains: string[];
  fileRefs: { name: string; id?: string }[];
  summary: string;
}

interface MonologueResult {
  observation: string;
  confidence: "high" | "medium" | "low";
  gaps: string[];
  next_action: "TOOL" | "REPLAN" | "VERIFY" | "FINISH";
  next_tool?: string;
  next_tool_input?: any;
  search_model?: string;
  thinking_narration: string;
  replan_steps?: string[];
  replan_reason?: string;
  verify_claim?: string;
  contradiction?: { claim: string; sourceA: string; sourceB: string };
  inline_data?: { headers: string[]; rows: string[][] };
}

// ──────────────────────────────────────────────
// Complexity Assessment & Model Selection
// ──────────────────────────────────────────────
function assessComplexity(query: string, context: { jurisdictions?: string[]; hasVault?: boolean }): number {
  let score = 0;
  if (context.jurisdictions && context.jurisdictions.length > 1) score += 3;
  if (/case law|precedent|ruling|judgment|court/i.test(query)) score += 2;
  if (/regulation|compliance|statute|act\s|regulatory/i.test(query)) score += 2;
  if (/compare|vs\.?|difference|contrast|distinguish/i.test(query)) score += 2;
  if (/multi.?jurisdict|cross.?border|international/i.test(query)) score += 2;
  if (/what is|define|meaning of|explain briefly/i.test(query)) score -= 2;
  if (/deep research|comprehensive|exhaustive|thorough analysis/i.test(query)) score += 3;
  // Floor at sonar-pro for any jurisdiction/legal query
  if (/jurisdiction|statute|case law|precedent|v\.\s|non-?compete|restraint of trade|confidential|fiduciary|negligence|tort|contract law|common law/i.test(query)) score = Math.max(score, 3);
  if (context.jurisdictions && context.jurisdictions.length >= 1) score = Math.max(score, 3);
  return Math.max(0, Math.min(10, score));
}

function selectPerplexityModel(score: number, deepResearch: boolean): { model: string; reasoningEffort?: string } {
  if (deepResearch || score >= 9) return { model: "sonar-deep-research", reasoningEffort: "high" };
  if (score >= 6) return { model: "sonar-deep-research" };
  if (score >= 3) return { model: "sonar-pro" };
  return { model: "sonar" };
}

// ──────────────────────────────────────────────
// Request Type Classification (hard-coded routing)
// ──────────────────────────────────────────────
function classifyRequestType(message: string, hasAttachedFiles: boolean, hasVault: boolean, conversationHistory: any[], sources?: string[]): 1 | 2 | 3 | 4 | 5 | 6 {
  // TYPE 3 — Document task (file attached or explicit doc reference)
  if (hasAttachedFiles) return 3;
  if (/this document|the uploaded|these contracts|attached file|this NDA|this contract|this agreement/i.test(message)) return 3;
  
  // TYPE 5 — EDGAR/SEC lookup
  if (/\b(SEC|EDGAR|10-K|10-Q|8-K|S-1|proxy\s*statement|annual\s*report|quarterly\s*filing)\b/i.test(message) || sources?.includes("EDGAR (SEC)")) return 5;
  
  // TYPE 6 — EUR-Lex lookup
  if (/\b(EUR-Lex|EU\s*regulation|EU\s*directive|GDPR|MiFID|AIFMD|european\s*court|CJEU|ECJ)\b/i.test(message) || sources?.includes("EUR-Lex")) return 6;
  
  // TYPE 2 — Case/research lookup (including CourtListener)
  if (/v\.\s|vs?\.\s|court|appeal|ruling|judgment|citation|\d+\s+(So|F|U\.S|S\.Ct)|case\s+(no|number|#)/i.test(message)) return 2;
  if (sources?.includes("CourtListener")) return 2;
  
  // TYPE 4 — Vault task
  if (/\b(our|my vault|saved|previous|from\s+(?:the\s+)?vault)\b/i.test(message)) return 4;
  
  // TYPE 1 — Factual/legal question (default)
  return 1;
}

// ──────────────────────────────────────────────
// Jurisdiction Prefix Map
// ──────────────────────────────────────────────
const JURISDICTION_PREFIX: Record<string, string> = {
  "UK": "UK law England Wales:",
  "UK Law": "UK law England Wales:",
  "US": "US law federal:",
  "US Law": "US law federal:",
  "EU": "European Union law:",
  "EUR-Lex": "European Union law:",
  "UAE": "UAE DIFC ADGM law:",
  "UAE Law": "UAE DIFC ADGM law:",
  "Singapore": "Singapore law MAS:",
  "Singapore Law": "Singapore law MAS:",
  "Indian Law": "Indian law:",
  "Canadian Law": "Canadian law:",
  "Australian Law": "Australian law:",
  "French Law": "French law:",
  "German Law": "German law:",
};

function prefixSearchQuery(query: string, jurisdictions: string[]): string {
  if (!jurisdictions.length) return query;
  const prefix = JURISDICTION_PREFIX[jurisdictions[0]];
  return prefix ? `${prefix} ${query}` : query;
}

// ──────────────────────────────────────────────
// Query Decomposition — Multi-Query Search
// ──────────────────────────────────────────────
function decomposeSearchQueries(
  message: string,
  tool: string,
  jurisdictions: string[],
  requestType: number
): string[] {
  // Strip meta-instructions that pollute search queries
  let cleaned = message
    .replace(/\b(search|find|look up|research|cite|analyze|explain|summarize|compare|deep research|give me)\b:?\s*/gi, "")
    .replace(/\b(using|via|from|through|in)\s+(courtlistener|edgar|eur-lex|sec|european)\s*/gi, "")
    .replace(/\b(please|can you|could you|I need|I want)\b\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 5) cleaned = message;

  const queries: string[] = [];

  switch (tool) {
    case "courtlistener": {
      // Extract case names (Party v Party patterns)
      const caseNames = message.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s+v\.?\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g);
      if (caseNames) {
        caseNames.forEach(cn => queries.push(cn));
      }
      // Extract legal doctrines/concepts
      const doctrines = cleaned.replace(/[A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g, "").trim();
      if (doctrines.length > 10) {
        queries.push(doctrines);
      }
      // Add jurisdiction-focused variant
      if (jurisdictions.length > 0 && queries.length > 0) {
        queries.push(`${jurisdictions[0]} ${queries[0]}`);
      }
      break;
    }
    case "edgar": {
      // Extract company names
      const companies = cleaned.match(/\b(Apple|Microsoft|Tesla|Google|Alphabet|Amazon|Meta|Facebook|Nvidia|JPMorgan|Goldman\s*Sachs)\b/gi);
      const formTypes = cleaned.match(/\b(10-K|10-Q|8-K|S-1|DEF\s*14A|20-F|6-K|proxy\s*statement|annual\s*report)\b/gi);
      if (companies) {
        companies.forEach(co => {
          const form = formTypes?.[0] || "";
          queries.push(`${co} ${form}`.trim());
        });
      }
      // Date-specific variant
      const yearMatch = cleaned.match(/\b(20\d{2})\b/);
      if (yearMatch && queries.length > 0) {
        queries.push(`${queries[0]} ${yearMatch[1]}`);
      }
      if (queries.length === 0) queries.push(cleaned);
      break;
    }
    case "eurlex": {
      // CELEX-first: check for known regulation references
      const knownTerms = ["gdpr", "ai act", "mifid", "dora", "dsa", "dma", "nis2", "digital services", "digital markets", "trade secrets", "ecommerce"];
      const foundTerms = knownTerms.filter(t => cleaned.toLowerCase().includes(t));
      foundTerms.forEach(t => queries.push(t));
      // Legal concept fallback
      const conceptQuery = cleaned.replace(/\b(EU|european|regulation|directive|article)\b/gi, "").trim();
      if (conceptQuery.length > 8 && !foundTerms.length) {
        queries.push(`EU ${conceptQuery}`);
      }
      // Article-specific query
      const articleMatch = cleaned.match(/article\s+(\d+)/i);
      if (articleMatch && foundTerms.length > 0) {
        queries.push(`${foundTerms[0]} article ${articleMatch[1]}`);
      }
      if (queries.length === 0) queries.push(cleaned);
      break;
    }
    case "web_search": {
      // Generate 2-3 angle queries
      queries.push(cleaned);
      // Jurisdiction-specific angle
      if (jurisdictions.length > 0) {
        queries.push(`${jurisdictions[0]} law ${cleaned}`);
      }
      // If complex query, add a focused sub-query
      if (cleaned.split(/\s+/).length > 8) {
        // Extract the core legal question (first sentence or clause)
        const firstSentence = cleaned.split(/[.?!]/)[0]?.trim();
        if (firstSentence && firstSentence !== cleaned) {
          queries.push(firstSentence);
        }
      }
      break;
    }
    default:
      queries.push(cleaned);
  }

  // Deduplicate and limit to 4 queries
  const unique = [...new Set(queries.map(q => q.trim()).filter(q => q.length > 3))];
  return unique.slice(0, 4);
}

const SOURCE_DOMAIN_MAP: Record<string, string[]> = {
  "EDGAR (SEC)": ["sec.gov", "edgar.sec.gov"],
  "CourtListener": ["courtlistener.com"],
  "EUR-Lex": ["eur-lex.europa.eu"],
  "WorldLII": ["worldlii.org"],
  "US Law": ["law.cornell.edu", "supremecourt.gov", "uscourts.gov"],
  "UK Law": ["legislation.gov.uk", "judiciary.uk", "bailii.org"],
  "Indian Law": ["indiankanoon.org", "sci.gov.in"],
  "Canadian Law": ["canlii.org", "laws-lois.justice.gc.ca"],
  "Australian Law": ["austlii.edu.au", "legislation.gov.au"],
  "French Law": ["legifrance.gouv.fr"],
  "German Law": ["gesetze-im-internet.de"],
  "Brazilian Law": ["planalto.gov.br"],
  "Singapore Law": ["sso.agc.gov.sg", "elitigation.sg"],
  "UAE Law": ["tamimi.com"],
  "Italian Law": ["normattiva.it"],
  "Web Search": [],
};

const PPLX_SYSTEM: Record<string, string> = {
  sonar: "You are a legal research assistant. Provide concise, accurate legal information with proper citations.",
  "sonar-pro": "You are a senior legal research specialist. Provide thorough, multi-source legal analysis with comprehensive citations.",
  "sonar-deep-research": "You are a senior legal researcher conducting comprehensive multi-source analysis. Analyze multiple jurisdictions and provide exhaustive citations.",
};

// ──────────────────────────────────────────────
// Tool: CourtListener Search
// ──────────────────────────────────────────────
async function toolCourtListener(query: string, apiKey: string): Promise<ToolResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["Authorization"] = `Token ${apiKey}`;
  const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query)}&type=o&format=json`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    return { context: "", citations: [], domains: ["courtlistener.com"], fileRefs: [], summary: `CourtListener error: ${resp.status}` };
  }
  const data = await resp.json();
  const results = (data.results || []).slice(0, 8);
  if (!results.length) {
    return { context: "No CourtListener results found.", citations: [], domains: ["courtlistener.com"], fileRefs: [], summary: "0 results" };
  }
  const citations = results.map((r: any, i: number) => ({
    index: i + 1,
    source: r.caseName || r.case_name || "Court Opinion",
    excerpt: (r.snippet || r.text || "").substring(0, 300),
    url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : undefined,
  }));
  const context = results.map((r: any) => {
    const name = r.caseName || r.case_name || "Unknown";
    const court = r.court || "";
    const date = r.dateFiled || r.date_filed || "";
    const text = (r.snippet || r.text || "").substring(0, 500);
    return `## ${name}\nCourt: ${court} | Date: ${date}\n${text}`;
  }).join("\n\n");
  return { context, citations, domains: ["courtlistener.com"], fileRefs: [], summary: `${results.length} cases found` };
}

// ──────────────────────────────────────────────
// Tool: EDGAR (SEC) Search
// ──────────────────────────────────────────────
async function toolEdgar(query: string, userAgent: string): Promise<ToolResult> {
  const ua = userAgent || "LawKit/1.0 contact@lawkit.ai";
  const headers: Record<string, string> = { "User-Agent": ua, Accept: "application/json" };

  // Known CIK mapping for common companies
  const CIK_MAP: Record<string, string> = {
    apple: "0000320193", microsoft: "0000789019", tesla: "0001318605",
    google: "0001652044", alphabet: "0001652044", amazon: "0001018724",
    meta: "0001326801", facebook: "0001326801", nvidia: "0001045810",
    jpmorgan: "0000019617", "goldman sachs": "0000886982",
  };

  // Extract form type from query
  const formMatch = query.match(/\b(10-K|10-Q|8-K|S-1|DEF\s*14A|20-F|6-K|proxy\s*statement)\b/i);
  const formType = formMatch ? formMatch[1].replace(/\s+/g, " ").toUpperCase().replace("PROXY STATEMENT", "DEF 14A") : "";

  // Try EDGAR EFTS full-text search API
  const eftsBase = "https://efts.sec.gov/LATEST/search-index";
  const formParam = formType ? `&forms=${encodeURIComponent(formType)}` : "&forms=10-K,10-Q,8-K,S-1,DEF+14A";
  const endpoints = [
    `${eftsBase}?q=${encodeURIComponent(query)}&dateRange=custom&startdt=2020-01-01${formParam}`,
    `${eftsBase}?q=${encodeURIComponent(query)}`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) { console.error(`EDGAR EFTS ${resp.status} for ${url}`); continue; }
      const data = await resp.json();
      const hits = (data.hits?.hits || data.filings || []).slice(0, 10);
      if (!hits.length) continue;

      const parsed = hits.map((h: any) => {
        const s = h._source || h;
        return {
          company: s.entity_name || s.display_names?.[0] || s.company_name || "Unknown",
          form_type: s.file_type || s.form_type || "Filing",
          filed_date: s.file_date || s.date_filed || "N/A",
          period: s.period_of_report || "",
          cik: s.entity_id || s.cik || "N/A",
          description: s.file_description || s.description || "",
          url: s.file_num
            ? `https://www.sec.gov/Archives/edgar/data/${s.entity_id}/${s.file_num.replace(/-/g, "")}`
            : (h.filing_href || `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${s.entity_id || s.cik}&type=${s.file_type || ""}&dateb=&owner=include&count=10`),
        };
      });

      const contextLines = parsed.map((p: any, i: number) =>
        `Filing ${i + 1}: ${p.company} — ${p.form_type} filed ${p.filed_date}${p.period ? ` (period: ${p.period})` : ""}. CIK: ${p.cik}. ${p.description}`
      );
      const context = `EDGAR returned ${parsed.length} filings.\n\n${contextLines.join("\n\n")}`;
      const citations = parsed.map((p: any, i: number) => ({
        index: i + 1,
        source: `${p.company} — ${p.form_type}`,
        excerpt: `Filed: ${p.filed_date}. ${p.description}`.substring(0, 200),
        url: p.url,
      }));
      return { context, citations, domains: ["sec.gov"], fileRefs: [], summary: `${parsed.length} filings found` };
    } catch (e) {
      console.error("EDGAR endpoint failed:", url, e);
      continue;
    }
  }

  // Fallback: Try CIK-based lookup for known companies
  const queryLower = query.toLowerCase();
  for (const [name, cik] of Object.entries(CIK_MAP)) {
    if (queryLower.includes(name)) {
      try {
        const subUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
        const subResp = await fetch(subUrl, { headers: { "User-Agent": ua, Accept: "application/json" } });
        if (subResp.ok) {
          const subData = await subResp.json();
          const recent = subData.filings?.recent;
          if (recent?.form) {
            const filings = [];
            for (let i = 0; i < Math.min(recent.form.length, 15); i++) {
              if (formType && recent.form[i] !== formType) continue;
              filings.push({
                company: subData.name || name,
                form_type: recent.form[i],
                filed_date: recent.filingDate[i],
                accession: recent.accessionNumber[i],
                url: `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, "")}/${recent.accessionNumber[i].replace(/-/g, "")}`,
              });
              if (filings.length >= 8) break;
            }
            if (filings.length > 0) {
              const contextLines = filings.map((f, i) =>
                `Filing ${i + 1}: ${f.company} — ${f.form_type} filed ${f.filed_date}. Accession: ${f.accession}`
              );
              const context = `EDGAR returned ${filings.length} filings for ${subData.name || name} (CIK: ${cik}).\n\n${contextLines.join("\n\n")}`;
              const citations = filings.map((f, i) => ({
                index: i + 1, source: `${f.company} — ${f.form_type}`, excerpt: `Filed: ${f.filed_date}`, url: f.url,
              }));
              return { context, citations, domains: ["sec.gov"], fileRefs: [], summary: `${filings.length} filings found` };
            }
          }
        }
      } catch (e) {
        console.error("EDGAR CIK lookup failed:", e);
      }
      break;
    }
  }

  // Final fallback: company search Atom feed
  try {
    const companyName = query.replace(/\b(10-K|10-Q|8-K|S-1|SEC|EDGAR|filing|annual|report|quarterly)\b/gi, "").trim();
    if (companyName.length > 2) {
      const atomUrl = `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=${formType || "10-K"}&dateb=&owner=include&count=10&search_text=&action=getcompany&output=atom`;
      const atomResp = await fetch(atomUrl, { headers: { "User-Agent": ua, Accept: "application/atom+xml" } });
      if (atomResp.ok) {
        const atomText = await atomResp.text();
        const entries = [...atomText.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
        if (entries.length > 0) {
          const results = entries.slice(0, 8).map((e) => {
            const title = e[1].match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || "Filing";
            const link = e[1].match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
            const updated = e[1].match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim() || "";
            const summary = e[1].match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
            return { title, link, updated, summary };
          });
          const contextLines = results.map((r, i) => `Filing ${i + 1}: ${r.title}. Date: ${r.updated}. ${r.summary}`);
          const context = `EDGAR company search returned ${results.length} results.\n\n${contextLines.join("\n\n")}`;
          const citations = results.map((r, i) => ({ index: i + 1, source: r.title, excerpt: r.summary.substring(0, 200), url: r.link }));
          return { context, citations, domains: ["sec.gov"], fileRefs: [], summary: `${results.length} company filings found` };
        }
      }
    }
  } catch (e) {
    console.error("EDGAR company search fallback failed:", e);
  }

  return { context: `EDGAR search for "${query}" returned no results. Try searching with a specific company name or CIK number.`, citations: [], domains: ["sec.gov"], fileRefs: [], summary: "0 results" };
}



// ──────────────────────────────────────────────
// Tool: EUR-Lex Search
// ──────────────────────────────────────────────
// Known CELEX numbers for common EU regulations
const KNOWN_CELEX: Record<string, { celex: string; title: string }> = {
  "gdpr": { celex: "32016R0679", title: "General Data Protection Regulation (GDPR)" },
  "general data protection": { celex: "32016R0679", title: "General Data Protection Regulation (GDPR)" },
  "ai act": { celex: "32024R1689", title: "EU Artificial Intelligence Act" },
  "artificial intelligence act": { celex: "32024R1689", title: "EU Artificial Intelligence Act" },
  "mifid": { celex: "32014L0065", title: "MiFID II - Markets in Financial Instruments Directive" },
  "mifid ii": { celex: "32014L0065", title: "MiFID II - Markets in Financial Instruments Directive" },
  "dora": { celex: "32022R2554", title: "Digital Operational Resilience Act (DORA)" },
  "trade secrets": { celex: "32016L0943", title: "Trade Secrets Directive" },
  "ecommerce directive": { celex: "32000L0031", title: "E-Commerce Directive" },
  "digital services act": { celex: "32022R2065", title: "Digital Services Act (DSA)" },
  "dsa": { celex: "32022R2065", title: "Digital Services Act (DSA)" },
  "digital markets act": { celex: "32022R1925", title: "Digital Markets Act (DMA)" },
  "dma": { celex: "32022R1925", title: "Digital Markets Act (DMA)" },
  "nis2": { celex: "32022L2555", title: "NIS 2 Directive" },
};

async function toolEurLex(query: string): Promise<ToolResult> {
  const queryLower = query.toLowerCase();

  // Check for known regulations first — direct CELEX fetch is faster and more reliable
  for (const [keyword, info] of Object.entries(KNOWN_CELEX)) {
    if (queryLower.includes(keyword)) {
      const celexUrl = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${info.celex}`;
      try {
        const resp = await fetch(celexUrl, { headers: { Accept: "text/html" } });
        if (resp.ok) {
          const html = await resp.text();
          // Extract first ~2000 chars of body text
          const bodyMatch = html.match(/<div[^>]*id="TexteOnly"[^>]*>([\s\S]*?)<\/div>/i)
            || html.match(/<div[^>]*class="eli-main-title"[^>]*>([\s\S]*?)<\/div>/i);
          const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().substring(0, 2000) : "";

          const context = `EUR-Lex: ${info.title}\nCELEX: ${info.celex}\nURL: ${celexUrl}\n\n${bodyText || "Full text available at the URL above."}`;
          return {
            context,
            citations: [{ index: 1, source: info.title, excerpt: `CELEX: ${info.celex}`, url: celexUrl }],
            domains: ["eur-lex.europa.eu"],
            fileRefs: [],
            summary: `Found: ${info.title}`,
          };
        }
      } catch (e) {
        console.error("EUR-Lex CELEX fetch failed:", e);
      }
    }
  }

  // General search via EUR-Lex search page
  const searchUrl = `https://eur-lex.europa.eu/search.html?scope=EURLEX&text=${encodeURIComponent(query)}&type=quick&lang=en`;
  try {
    const resp = await fetch(searchUrl, { headers: { Accept: "text/html", "User-Agent": "LawKit/1.0" } });
    if (!resp.ok) {
      return { context: `EUR-Lex search for "${query}" failed (${resp.status}). Direct search URL: ${searchUrl}`, citations: [{ index: 1, source: "EUR-Lex", excerpt: query, url: searchUrl }], domains: ["eur-lex.europa.eu"], fileRefs: [], summary: "EUR-Lex search failed" };
    }
    const html = await resp.text();

    // Try multiple patterns to extract results from EUR-Lex HTML
    const results: { title: string; celex: string; url: string }[] = [];

    // Pattern 1: SearchResult titles (class may vary)
    const titlePatterns = [
      /<a[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]*href="[^"]*CELEX[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
      /<div[^>]*class="[^"]*SearchResult[^"]*"[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    ];

    // Extract CELEX numbers from the whole page
    const allCelex = [...html.matchAll(/CELEX[:=](\d{5}[A-Z]\d{4})/gi)].map(m => m[1]);

    for (const pattern of titlePatterns) {
      if (results.length >= 6) break;
      const matches = [...html.matchAll(pattern)];
      for (let i = 0; i < Math.min(matches.length, 6); i++) {
        const match = matches[i];
        const title = (match[2] || match[1]).replace(/<[^>]*>/g, "").trim();
        if (!title || title.length < 5) continue;
        const celex = allCelex[results.length] || "";
        const resultUrl = celex ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}` : searchUrl;
        results.push({ title: title.substring(0, 200), celex, url: resultUrl });
      }
    }

    if (results.length === 0) {
      // Fallback: just provide the search URL with context
      return {
        context: `EUR-Lex search for "${query}" completed. ${allCelex.length} CELEX references found on page. View results at: ${searchUrl}${allCelex.length > 0 ? `\n\nCELEX numbers found: ${allCelex.slice(0, 5).join(", ")}` : ""}`,
        citations: [{ index: 1, source: "EUR-Lex Search", excerpt: query, url: searchUrl }],
        domains: ["eur-lex.europa.eu"],
        fileRefs: [],
        summary: `${allCelex.length} references found`,
      };
    }

    const contextLines = results.map((r, i) => `Result ${i + 1}: ${r.title}${r.celex ? ` (CELEX: ${r.celex})` : ""}. URL: ${r.url}`);
    const context = `EUR-Lex returned ${results.length} results for "${query}".\n\n${contextLines.join("\n\n")}`;
    const citations = results.map((r, i) => ({ index: i + 1, source: r.title.substring(0, 100), excerpt: r.celex ? `CELEX: ${r.celex}` : "", url: r.url }));
    return { context, citations, domains: ["eur-lex.europa.eu"], fileRefs: [], summary: `${results.length} EU law results` };
  } catch (e) {
    console.error("EUR-Lex search failed:", e);
    return { context: `EUR-Lex search error. Direct search URL: ${searchUrl}`, citations: [{ index: 1, source: "EUR-Lex", excerpt: query, url: searchUrl }], domains: ["eur-lex.europa.eu"], fileRefs: [], summary: "EUR-Lex search error" };
  }
}

// ──────────────────────────────────────────────
// SSE Emitters
// ──────────────────────────────────────────────
function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: any) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

// ──────────────────────────────────────────────
// Tool: Vault Search (Qdrant RAG)
// ──────────────────────────────────────────────
async function toolVaultSearch(
  query: string, orgId: string, vaultId: string | undefined,
  attachedFileIds: string[] | undefined,
  qdrantConf: any, openaiConf: any, embeddingModel: string,
  adminClient: any
): Promise<ToolResult> {
  if (!qdrantConf?.url || !qdrantConf?.api_key || !openaiConf?.api_key) {
    // Fallback: read files directly
    return toolReadFiles(orgId, vaultId, attachedFileIds, adminClient);
  }

  const queryEmbedding = await embedQuery(query, openaiConf.api_key, embeddingModel);
  const collectionName = `${qdrantConf.collection_prefix || "org_"}${orgId}`;

  const mustFilters: any[] = [];
  const fileRefs: { name: string; id?: string }[] = [];

  if (vaultId) {
    const { data: vaultFiles } = await adminClient.from("files").select("id, name").eq("vault_id", vaultId).eq("organization_id", orgId);
    if (vaultFiles?.length) {
      mustFilters.push({ key: "file_id", match: { any: vaultFiles.map((f: any) => f.id) } });
      fileRefs.push(...vaultFiles.slice(0, 10).map((f: any) => ({ name: f.name, id: f.id })));
    }
  }
  if (attachedFileIds?.length) {
    mustFilters.push({ key: "file_id", match: { any: attachedFileIds } });
  }

  const searchResp = await fetch(`${qdrantConf.url}/collections/${collectionName}/points/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": qdrantConf.api_key },
    body: JSON.stringify({ vector: queryEmbedding, limit: 8, with_payload: true, filter: { must: mustFilters } }),
  });

  if (!searchResp.ok) {
    return toolReadFiles(orgId, vaultId, attachedFileIds, adminClient);
  }

  const searchData = await searchResp.json();
  const results = searchData.result || [];

  if (results.length === 0) {
    return toolReadFiles(orgId, vaultId, attachedFileIds, adminClient);
  }

  let context = "\n\n## Relevant Document Chunks\n";
  const citations: ToolResult["citations"] = [];
  results.forEach((r: any, i: number) => {
    const p = r.payload || {};
    context += `### [${i + 1}] ${p.file_name || "Unknown"} (chunk ${p.chunk_index})\n${p.content}\n\n`;
    citations.push({ index: i + 1, source: p.file_name || "Document", excerpt: (p.content || "").substring(0, 200) });
  });

  return { context, citations, domains: [], fileRefs, summary: `Found ${results.length} relevant document sections` };
}

// ──────────────────────────────────────────────
// Tool: Read Files Directly
// ──────────────────────────────────────────────
async function toolReadFiles(orgId: string, vaultId: string | undefined, attachedFileIds: string[] | undefined, adminClient: any): Promise<ToolResult> {
  // If explicit file IDs are provided, prioritize them over vault-wide query
  const fileQuery = adminClient.from("files").select("id, name, extracted_text, status").eq("organization_id", orgId);
  if (attachedFileIds?.length) {
    fileQuery.in("id", attachedFileIds);
  } else if (vaultId) {
    fileQuery.eq("vault_id", vaultId);
  }
  let { data: files } = await fileQuery.limit(10);

  // If attached files exist but none have extracted_text, poll up to 30s for readiness
  if (attachedFileIds?.length && files?.length && files.every((f: any) => !f.extracted_text)) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const { data: refreshed } = await adminClient.from("files").select("id, name, extracted_text, status").in("id", attachedFileIds).limit(10);
      if (refreshed?.some((f: any) => f.extracted_text)) {
        files = refreshed;
        break;
      }
      if (refreshed?.every((f: any) => f.status === "error")) break;
    }
  }

  const readyFiles = (files || []).filter((f: any) => f.extracted_text);
  if (!readyFiles.length) {
    return { context: "", citations: [], domains: [], fileRefs: [], summary: "No documents found" };
  }

  let context = "\n\n## Document Contents\n";
  const citations: ToolResult["citations"] = [];
  const fileRefs: { name: string; id?: string }[] = [];
  readyFiles.forEach((f: any, i: number) => {
    const charLimit = 50000;
    context += `### [${i + 1}] ${f.name}\n${f.extracted_text?.substring(0, charLimit)}\n\n`;
    citations.push({ index: i + 1, source: f.name, excerpt: (f.extracted_text || "").substring(0, 200) });
    fileRefs.push({ name: f.name, id: f.id });
  });

  return { context, citations, domains: [], fileRefs, summary: `Read ${readyFiles.length} documents directly` };
}

// ──────────────────────────────────────────────
// Tool: Web Search (Perplexity)
// ──────────────────────────────────────────────
async function toolWebSearch(
  query: string, perplexityKey: string, model: string,
  sources: string[] | undefined, jurisdictions: string[],
  reasoningEffort?: string
): Promise<ToolResult> {
  const prefixedQuery = prefixSearchQuery(query, jurisdictions);

  const domainFilter: string[] = [];
  if (sources) {
    for (const s of sources) {
      const domains = SOURCE_DOMAIN_MAP[s];
      if (domains?.length) domainFilter.push(...domains);
    }
  }

  const pplxBody: any = {
    model,
    messages: [
      { role: "system", content: PPLX_SYSTEM[model] || PPLX_SYSTEM.sonar },
      { role: "user", content: prefixedQuery },
    ],
    max_tokens: model === "sonar-deep-research" ? 8192 : model === "sonar-pro" ? 4096 : 2048,
  };
  if (domainFilter.length > 0) pplxBody.search_domain_filter = domainFilter.slice(0, 5);
  if (reasoningEffort) pplxBody.reasoning_effort = reasoningEffort;

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${perplexityKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(pplxBody),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Perplexity error:", resp.status, errText);
    return { context: "", citations: [], domains: [], fileRefs: [], summary: `Search failed (${resp.status})` };
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  const citationUrls: string[] = data.citations || [];

  let context = `\n\n## Research Results\n${content}`;
  const citations: ToolResult["citations"] = [];
  const domains: string[] = [];

  // Extract search result titles from Perplexity response
  const searchResultTitles: string[] = data.search_results?.map((r: any) => r.title || "") || [];

  if (citationUrls.length > 0) {
    context += "\n\n### Sources:\n" + citationUrls.map((url: string, i: number) => `[${i + 1}] ${url}`).join("\n");
    citationUrls.forEach((url: string, i: number) => {
      let domain = url;
      try { domain = new URL(url).hostname.replace("www.", ""); } catch {}
      const title = searchResultTitles[i] || undefined;
      citations.push({ index: i + 1, source: title || domain, excerpt: url, url, title });
      domains.push(domain);
    });
  }

  return { context, citations, domains: [...new Set(domains)], fileRefs: [], summary: `Found ${citationUrls.length} sources` };
}

// ──────────────────────────────────────────────
// Inner Monologue — LLM call after each tool
// ──────────────────────────────────────────────
const INNER_MONOLOGUE_PROMPT = `You are LawKit's reasoning engine mid-task. You just executed a tool and received its result. Decide what to do next.

Reason through:
1. What did I just learn?
2. Does this change my understanding of the task?
3. Do I have enough to answer fully and accurately?
4. What would a senior lawyer notice that I might miss?
5. Is there a faster path to the answer?

OUTPUT ONLY THIS JSON (no markdown, no backticks):
{
  "observation": "What I just learned",
  "confidence": "high|medium|low",
  "gaps": ["what I still don't know"],
  "next_action": "TOOL|REPLAN|VERIFY|FINISH",
  "next_tool": "vault_search|web_search|read_files|courtlistener|edgar|eurlex",
  "next_tool_input": {"query": "search query if TOOL"},
  "search_model": "sonar|sonar-pro|sonar-deep-research",
  "thinking_narration": "2-3 sentences for user to see",
  "replan_steps": ["new step 1", "new step 2"],
  "replan_reason": "if REPLAN why",
  "verify_claim": "if VERIFY what to check",
  "contradiction": null,
  "inline_data": null,
  "vault_result_relevant": true
}

RULES:
- Choose FINISH only if gaps array is empty
- If confidence is low → VERIFY before FINISH
- If gaps has items → keep working
- Never FINISH on first iteration for complex tasks (5+ plan steps)
- If same tool called 3 times with same params → REPLAN
- For contradiction, use: {"claim":"...", "sourceA":"...", "sourceB":"..."}
- For inline_data, use: {"headers":["col1","col2"], "rows":[["val1","val2"]]}
- VAULT FALLBACK RULE: If vault_search returned empty results, irrelevant results (invoices, receipts, wrong file types), or results unrelated to the query → set vault_result_relevant to false and next_action to TOOL with next_tool "web_search". NEVER FINISH after irrelevant vault results when web search is available. Always fall back to web_search before answering from training data.
- Only cite sources that actually contributed to your answer. Never cite vault documents if the answer came from web search or training data.
- EXPLICIT ATTACHMENT RULE: If "has_explicit_attachments" is true in the input, the user has explicitly attached specific files. You MUST analyze those files. Do NOT suggest vault_search, do NOT ask which file to analyze. The attached files ARE the scope. Set next_action to FINISH once you have read them.`;

async function innerMonologue(
  aiUrl: string, aiKey: string, modelId: string, headers: Record<string, string>,
  query: string, plan: string[], accumulatedContext: string[], latestResult: ToolResult,
  iteration: number, totalPlanSteps: number, explicitAttachmentNames?: string[]
): Promise<MonologueResult> {
  const contextSummary = accumulatedContext.map((c, i) => `--- Context block ${i + 1} ---\n${c.substring(0, 2000)}`).join("\n");

  try {
    const monologueInput: any = {
            original_query: query,
            plan,
            iteration,
            total_plan_steps: totalPlanSteps,
            accumulated_context_summary: contextSummary.substring(0, 6000),
            latest_tool_result: latestResult.summary,
            latest_tool_context_preview: latestResult.context.substring(0, 2000),
          };
    // Signal explicit attachments to prevent monologue from asking "which file?"
    if (explicitAttachmentNames?.length) {
      monologueInput.has_explicit_attachments = true;
      monologueInput.attached_file_names = explicitAttachmentNames;
    }

    const resp = await fetch(aiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: INNER_MONOLOGUE_PROMPT },
          { role: "user", content: JSON.stringify(monologueInput) },
        ],
        max_tokens: 500,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error("Inner monologue LLM error:", resp.status);
      return defaultFinish("Reasoning step complete. Preparing final answer.");
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaultFinish("Analysis complete. Preparing response.");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      observation: parsed.observation || "",
      confidence: parsed.confidence || "medium",
      gaps: parsed.gaps || [],
      next_action: parsed.next_action || "FINISH",
      next_tool: parsed.next_tool,
      next_tool_input: parsed.next_tool_input,
      search_model: parsed.search_model,
      thinking_narration: parsed.thinking_narration || "Processing...",
      replan_steps: parsed.replan_steps,
      replan_reason: parsed.replan_reason,
      verify_claim: parsed.verify_claim,
      contradiction: parsed.contradiction,
      inline_data: parsed.inline_data,
    };
  } catch (err) {
    console.error("Inner monologue error:", err);
    return defaultFinish("Analysis complete. Synthesizing response.");
  }
}

function defaultFinish(narration: string): MonologueResult {
  return {
    observation: "Complete", confidence: "medium", gaps: [],
    next_action: "FINISH", thinking_narration: narration,
  };
}

// ──────────────────────────────────────────────
// Self-Verification
// ──────────────────────────────────────────────
async function selfVerify(
  aiUrl: string, aiKey: string, modelId: string, headers: Record<string, string>,
  query: string, plan: string[], accumulatedContext: string[]
): Promise<{ passed: boolean; reason: string }> {
  try {
    const resp = await fetch(aiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: "Review work done so far. Output JSON only: {\"passed\": true/false, \"reason\": \"why\"}" },
          { role: "user", content: JSON.stringify({
            query,
            plan,
            context_gathered: accumulatedContext.length,
            context_preview: accumulatedContext.map(c => c.substring(0, 500)).join("\n---\n"),
            questions: [
              "Did I fully answer the request?",
              "Are all citations from actually retrieved sources?",
              "Is anything missing or only partially addressed?",
            ],
          }) },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });

    if (!resp.ok) return { passed: true, reason: "Self-check skipped" };

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { passed: true, reason: "Parse error — assuming pass" };

    const parsed = JSON.parse(jsonMatch[0]);
    return { passed: parsed.passed !== false, reason: parsed.reason || "" };
  } catch {
    return { passed: true, reason: "Self-check error — assuming pass" };
  }
}

// ──────────────────────────────────────────────
// Intent Analysis (structured via tool calling)
// ──────────────────────────────────────────────
async function analyzeIntent(
  aiUrl: string, aiKey: string, modelId: string, headers: Record<string, string>,
  query: string, hasVault: boolean, hasSources: boolean, effectiveMode?: string
): Promise<{
  taskType: string; jurisdictions: string[]; complexityScore: number;
  plan: string[]; approach: string; needsVaultSearch: boolean; needsWebSearch: boolean;
}> {
  try {
    const resp = await fetch(aiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: `You are a legal AI planning engine. Analyze the user's legal query and generate a detailed, multi-step execution plan.

RULES:
- Always generate 3-7 specific, actionable steps
- If vault documents are available, include a "Search uploaded documents for [specific topic]" step
- If web search is available, include a "Research [specific aspect] via legal databases" step  
- Always end with a "Synthesize findings into comprehensive response" step
- Each step should be specific to the query, not generic
- For research queries: include vault search + web search + cross-reference + synthesis
- For drafting queries: include research relevant templates + draft document + review clauses
- For analysis queries: include document analysis + identify key provisions + compare against standards
- IMPORTANT: When the AI needs to ask for clarification, it MUST generate context-relevant numbered options in the response (not generic ones). Each option should relate to the specific topic being discussed.
- If the user message is short or ambiguous (under 10 words), resolve it against the conversation history before treating it as a new query. Combine the previous topic with the new message to form a complete query.` },
          { role: "user", content: `Query: "${query}"\nHas vault documents: ${hasVault}\nHas search sources: ${hasSources}\nMode: ${effectiveMode || "chat"}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_intent",
            description: "Analyze legal query intent and generate execution plan",
            parameters: {
              type: "object",
              properties: {
                task_type: { type: "string", enum: ["research", "draft", "analyze", "compare", "review", "chat"] },
                jurisdictions: { type: "array", items: { type: "string" } },
                complexity_score: { type: "number" },
                plan: { type: "array", items: { type: "string" }, description: "Specific actionable steps" },
                approach: { type: "string" },
                needs_vault_search: { type: "boolean" },
                needs_web_search: { type: "boolean" },
              },
              required: ["task_type", "plan", "complexity_score", "needs_vault_search", "needs_web_search"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_intent" } },
        max_tokens: 500,
        temperature: 0,
      }),
    });

    if (!resp.ok) throw new Error(`Intent analysis failed: ${resp.status}`);

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const args = JSON.parse(toolCall.function.arguments);
    return {
      taskType: args.task_type || "chat",
      jurisdictions: args.jurisdictions || [],
      complexityScore: args.complexity_score ?? assessComplexity(query, {}),
      plan: args.plan || ["Analyze query", "Synthesize response"],
      approach: args.approach || "",
      needsVaultSearch: hasVault ? (args.needs_vault_search !== false) : false,
      needsWebSearch: args.needs_web_search !== false,
    };
  } catch (err) {
    console.error("Intent analysis error:", err);
    // Fallback
    const plan: string[] = ["Analyze query"];
    if (hasVault) plan.push("Search uploaded documents");
    plan.push("Research relevant legal sources");
    plan.push("Cross-reference and verify findings");
    plan.push("Synthesize comprehensive response");
    return {
      taskType: effectiveMode || "chat",
      jurisdictions: [],
      complexityScore: assessComplexity(query, {}),
      plan,
      approach: "Standard analysis",
      needsVaultSearch: hasVault,
      needsWebSearch: hasSources,
    };
  }
}

// ──────────────────────────────────────────────
// Base System Prompt Builder
// ──────────────────────────────────────────────
function getLawKitBasePrompt(jurisdictions: string[], orgKnowledge: string, orgName: string, userName: string, userEmail: string): string {
  const jurisdictionBlock = jurisdictions.length > 0
    ? `\nPRIMARY JURISDICTION: ${jurisdictions.join(", ")}\nEvery search, analysis, and recommendation defaults to ${jurisdictions[0]} law unless told otherwise. Always cite jurisdiction-specific statutes, regulations, and case law where available.\n`
    : "";

  return `You are LawKit, an elite legal AI agent.
You think like a senior partner, research like a junior associate, and write like a professional drafter.
${jurisdictionBlock}
${orgKnowledge ? `## Organization Knowledge\n${orgKnowledge}\n` : ""}
## Context
- Organization: ${orgName}
- User: ${userName}
- Email: ${userEmail}

## Operating Principles
- Never answer from memory when you can verify
- Never cite sources you have not actually retrieved
- Never conclude from a single source on legal matters
- Always show your reasoning, not just your conclusion
- Always attribute every factual claim to its source
- Surface contradictions rather than hiding them
- A partial answer clearly labeled is better than a confident wrong answer
- NEVER start a response with "I don't have sufficient information", "My internal knowledge base does not contain", "Unfortunately, I", or any caveat/disclaimer. Your FIRST sentence must directly answer the query or describe what you found. If tools are available, use them silently and return the answer.
- TOOL ENFORCEMENT: If CourtListener, EDGAR, or EUR-Lex tools were called during this session, you MUST cite and analyze those results in your response. If they returned no results, state what was searched and that no matches were found, then suggest alternative queries. NEVER tell the user to search manually. NEVER say "I cannot access" any tool. If a tool returned an error, report the error briefly and fall back to web search.
- EDGAR KNOWLEDGE: Apple CIK is 0000320193 (fiscal year ends September). Microsoft CIK is 0000789019. Tesla CIK is 0001318605. When a user asks for a "2024 10-K" and none is found, explain the fiscal year mismatch and show the closest filing found.
- CASE LAW REQUIREMENT: For jurisdiction-specific legal research, you MUST cite at least one real named case from that jurisdiction. For UK non-compete: cite Tillman v Egon Zehnder [2019] UKSC 32, Herbert Morris v Saxelby [1916] 1 AC 688. For Singapore restraint of trade: cite Man Financial v Wong Bark Chuan David [2008] 1 SLR 663, Smile Inc v Lui Andrew Stewart [2012] 4 SLR 308. For US liquidated damages: cite Cavendish Square Holding v Talal El Makdessi [2015] UKSC 67. Never answer a jurisdiction-specific legal question without citing at least one real named case.

## Citation Format
- Inline: [filename · p.4] or [Perplexity Search · URL]
- Use [1], [2], [3] notation — sequential integers only
- NEVER use [Web] or non-numeric markers
- Cite every factual claim with its source number

## Formatting
- Use markdown: headers, lists, bold for key terms
- Use tables for comparative data — ALWAYS ensure a blank line before and after any markdown table
- Do NOT include a "References:", "Citations:", or "Sources:" section at the end — citations are handled automatically by the UI
- Use comparison tables aggressively when analyzing multiple documents, jurisdictions, or options
- IMPORTANT: When you need more information or clarification, provide 3-4 numbered options that are SPECIFIC and CONTEXTUALLY RELEVANT to the user's query. NEVER use generic category choices like "Corporate Law", "Contract Law" etc. Each option must relate directly to the topic being discussed.
- At the end, suggest 3 follow-up questions starting with ">>FOLLOWUP: "`;
}

// ──────────────────────────────────────────────
// MAIN SERVER
// ──────────────────────────────────────────────
const MAX_ITERATIONS = 20;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await adminClient.from("profiles").select("organization_id, full_name, email").eq("id", userId).single();
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "No organization found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orgId = profile.organization_id;
    const body: ChatRequest = await req.json();
    const { conversationId, message, vaultId, deepResearch, attachedFileIds, attachedFileNames, sources, history, useCase, vaultName: clientVaultName, promptMode, currentSheetState, columnMeta, fileNames, existingSheet, workflowSystemPrompt, currentDocumentContent } = body;

    // ──────── COLUMN FILL (non-streaming, preserved as-is) ────────
    if (useCase === "column_fill" && columnMeta) {
      let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      let aiKey = Deno.env.get("LOVABLE_API_KEY") || "";
      let modelId = "google/gemini-2.5-flash";
      const { data: llmConfigs } = await adminClient.from("llm_configs").select("*").or(`organization_id.eq.${orgId},organization_id.is.null`).eq("is_active", true).eq("use_case", "extraction").order("is_default", { ascending: false }).limit(1);
      if (llmConfigs?.[0]) {
        let m = llmConfigs[0].model_id;
        if (m && !m.includes("/")) { if (m.startsWith("gemini")) m = `google/${m}`; else if (m.startsWith("gpt")) m = `openai/${m}`; }
        modelId = m || modelId;
      }
      const fileNamesList = fileNames || existingSheet?.rows?.map((r: any) => r.fileName) || [];
      let fileContentContext = "";
      if (fileNamesList.length > 0) {
        const { data: fileRecords } = await adminClient.from("files").select("name, extracted_text").eq("organization_id", orgId).in("name", fileNamesList).not("extracted_text", "is", null).limit(50);
        if (fileRecords?.length) fileContentContext = "\n\n## Document Contents\n" + fileRecords.map((f: any) => `### ${f.name}\n${(f.extracted_text || "").substring(0, 4000)}`).join("\n\n");
      }
      const prompt = `Extract "${columnMeta.name}" (${columnMeta.type}) using query: "${columnMeta.query}" from these files:\n${fileNamesList.map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}${fileContentContext}\n\nRespond with ONLY JSON: {"filename": "value", ...}`;
      try {
        const resp = await fetch(aiUrl, { method: "POST", headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: modelId, messages: [{ role: "system", content: "Extract data. Respond only with valid JSON." }, { role: "user", content: prompt }], max_tokens: 2048, temperature: 0.1 }) });
        if (resp.ok) {
          const data = await resp.json();
          const c = data.choices?.[0]?.message?.content || "{}";
          const match = c.match(/\{[\s\S]*\}/);
          return new Response(JSON.stringify({ values: match ? JSON.parse(match[0]) : {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: "AI extraction failed", values: {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch { return new Response(JSON.stringify({ error: "Column fill failed", values: {} }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    }

    // ──────── LOAD CONFIGURATION ────────
    const { data: orgData } = await adminClient.from("organizations").select("name").eq("id", orgId).single();
    const { data: agentConfig } = await adminClient.from("api_integrations").select("config").eq("organization_id", orgId).eq("provider", "agent_config").maybeSingle();
    const agentConf = (agentConfig?.config as any) || {};
    const qdrantConf = agentConf.qdrant || {};
    const openaiConf = agentConf.openai || {};
    const embeddingModel = agentConf.document_analysis?.embedding_model || "text-embedding-3-small";

    // Conversation history
    let conversationHistory: { role: string; content: string }[] = [];
    if (conversationId && conversationId !== "column-fill") {
      const { data: dbMessages } = await adminClient.from("messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(20);
      if (dbMessages?.length) conversationHistory = dbMessages.map((m: any) => ({ role: m.role, content: m.content }));
    }
    if (!conversationHistory.length && history?.length) conversationHistory = history;

    // Sheet state
    let existingSheetJson = "";
    if (currentSheetState) {
      existingSheetJson = JSON.stringify(currentSheetState);
    } else {
      for (const msg of conversationHistory) {
        const m = msg.content.match(/<!--\s*SHEET:\s*(.+?)\s*-->\s*```json\s*([\s\S]*?)```/);
        if (m) existingSheetJson = m[2];
      }
    }

    let effectiveMode = promptMode || useCase;
    const needsSearch = (sources && sources.length > 0) || deepResearch;
    const isUploadsVaultEarly = clientVaultName === "Uploads" || clientVaultName === "Prompt Uploads";
    // Treat as "has vault" if explicit file IDs exist OR a non-Uploads vault is selected
    const hasVault = !!(attachedFileIds?.length) || !!(vaultId && !isUploadsVaultEarly);

    // Auto-detect red flag intent from message keywords regardless of mode
    const isRedFlagIntent = /red\s*flag|red\s*line|flag.*clause|risky.*clause|analyze.*risk/i.test(message);
    if (isRedFlagIntent && effectiveMode !== "red_flags") {
      effectiveMode = "red_flags";
    }
    // ──────── RESOLVE AI CONFIG ────────
    let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let aiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    let modelId = "google/gemini-2.5-flash";
    let aiHeaders: Record<string, string> = { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" };

    const { data: llmConfigs } = await adminClient.from("llm_configs").select("*").or(`organization_id.eq.${orgId},organization_id.is.null`).eq("is_active", true).eq("use_case", "chat").order("is_default", { ascending: false }).limit(1);
    if (llmConfigs?.[0]) {
      let m = llmConfigs[0].model_id;
      if (m && !m.includes("/")) { if (m.startsWith("gemini")) m = `google/${m}`; else if (m.startsWith("gpt")) m = `openai/${m}`; }
      modelId = m || modelId;
    }

    // Load Perplexity key
    let perplexityKey = "";
    const { data: pplxConfig } = await adminClient.from("api_integrations").select("api_key_encrypted, api_key_iv").eq("organization_id", orgId).eq("provider", "perplexity").eq("is_active", true).maybeSingle();
    if (pplxConfig?.api_key_encrypted) {
      try { perplexityKey = await decryptApiKey(pplxConfig.api_key_encrypted, pplxConfig.api_key_iv || ""); } catch (e) { console.error("Decrypt perplexity key failed:", e); }
    }

    // Load Legal API configs (CourtListener, EDGAR, EUR-Lex)
    let courtListenerKey = "";
    const { data: clConfig } = await adminClient.from("api_integrations").select("api_key_encrypted, api_key_iv").eq("organization_id", orgId).eq("provider", "courtlistener").eq("is_active", true).maybeSingle();
    if (clConfig?.api_key_encrypted) {
      try { courtListenerKey = await decryptApiKey(clConfig.api_key_encrypted, clConfig.api_key_iv || ""); } catch (e) { console.error("Decrypt courtlistener key failed:", e); }
    }

    let edgarUserAgent = "LawKit/1.0 legal@lawkit.ai";
    const { data: edgarConfig } = await adminClient.from("api_integrations").select("config").eq("organization_id", orgId).eq("provider", "edgar").eq("is_active", true).maybeSingle();
    if (edgarConfig?.config && (edgarConfig.config as any).user_agent) {
      edgarUserAgent = (edgarConfig.config as any).user_agent;
    }
    const edgarEnabled = !!edgarConfig;

    const { data: eurlexConfig } = await adminClient.from("api_integrations").select("id").eq("organization_id", orgId).eq("provider", "eurlex").eq("is_active", true).maybeSingle();
    const eurlexEnabled = !!eurlexConfig;

    const encoder = new TextEncoder();

    // ──────── FAST-PATH: Simple conversational messages ────────
    const wordCount = message.trim().split(/\s+/).length;
    const isSimpleChat = wordCount <= 5
      && !attachedFileIds?.length
      && !deepResearch
      && (!sources || sources.length === 0)
      && !effectiveMode
      && !workflowSystemPrompt
      && !currentDocumentContent
      && !vaultId
      && !/\b(law|legal|case|statute|regulation|contract|clause|court|file|document|draft|review|analyze|red.?flag)\b/i.test(message);

    if (isSimpleChat) {
      // Direct quick response — no planner, no ReAct loop
      const fastStream = new ReadableStream({
        async start(controller) {
          try {
            // Load minimal context
            const { data: orgData } = await adminClient.from("organizations").select("name").eq("id", orgId).single();

            emit(controller, encoder, { type: "step", step: { name: "Processing", status: "working" } });

            const systemPrompt = `You are LawKit, a professional legal AI assistant for ${orgData?.name || "the organization"}. 
User: ${profile.full_name || profile.email}. 
Respond naturally and concisely. For simple greetings or conversational messages, be friendly and brief.
If the user asks a follow-up that needs context from previous messages, use the conversation history provided.
At the end, suggest 3 relevant follow-up questions starting with ">>FOLLOWUP: "`;

            const aiMessages = [
              { role: "system", content: systemPrompt },
              ...conversationHistory.map((m: any) => ({ role: m.role, content: m.content })),
              { role: "user", content: message },
            ];

            // Save user message
            if (conversationId && conversationId !== "column-fill") {
              await adminClient.from("messages").insert({ conversation_id: conversationId, organization_id: orgId, role: "user", content: message });
            }

            const aiResponse = await fetch(aiUrl, {
              method: "POST",
              headers: aiHeaders,
              body: JSON.stringify({ model: modelId, messages: aiMessages, stream: true, max_tokens: 1024, temperature: 0.5 }),
            });

            emit(controller, encoder, { type: "step", step: { name: "Processing", status: "done", duration: "0s" } });

            if (!aiResponse.ok) {
              emit(controller, encoder, { type: "error", error: "AI service temporarily unavailable." });
              controller.close();
              return;
            }

            emit(controller, encoder, { type: "final_answer_start" });

            const reader = aiResponse.body!.getReader();
            const decoder = new TextDecoder();
            let fullContent = "";
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let newlineIndex: number;
              while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
                let line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullContent += content;
                    emit(controller, encoder, { type: "token", content });
                  }
                } catch {}
              }
            }

            // Extract follow-ups
            const followUps: string[] = [];
            fullContent.split("\n").filter(l => l.startsWith(">>FOLLOWUP: ")).forEach(l => {
              const q = l.replace(">>FOLLOWUP: ", "").trim();
              if (q) followUps.push(q);
            });
            const cleanedContent = fullContent.split("\n").filter(l => !l.startsWith(">>FOLLOWUP: ")).join("\n").trim();

            emit(controller, encoder, { type: "done", citations: [], model: modelId, followUps });

            // Save assistant message
            if (conversationId && conversationId !== "column-fill") {
              await adminClient.from("messages").insert({
                conversation_id: conversationId, organization_id: orgId, role: "assistant",
                content: cleanedContent, model_used: modelId,
              });
              const { count } = await adminClient.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", conversationId);
              if (count && count <= 2) {
                const title = cleanedContent.substring(0, 60).replace(/[#*\n]/g, "").trim();
                await adminClient.from("conversations").update({ title }).eq("id", conversationId);
              }
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            console.error("Fast-path error:", err);
            emit(controller, encoder, { type: "error", error: "Stream interrupted" });
            controller.close();
          }
        },
      });

      return new Response(fastStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const stepStartTimes = new Map<string, number>();
          let accumulatedThinkingText = "";

          const trackStep = (name: string, status: string, detail?: string) => {
            if (status === "working") stepStartTimes.set(name, Date.now());
            let duration: string | undefined;
            if (status === "done") { const s = stepStartTimes.get(name); if (s) duration = `${Math.round((Date.now() - s) / 1000)}s`; }
            emit(controller, encoder, { type: "step", step: { name, status, detail, duration } });
          };

          const emitThinking = (content: string) => {
            accumulatedThinkingText += (accumulatedThinkingText ? "\n" : "") + content;
            emit(controller, encoder, { type: "thinking", content });
          };

          // ════════════════════════════════════
          // PHASE 1: LOAD KNOWLEDGE + VAULT INFO
          // ════════════════════════════════════
          trackStep("Analyzing your query", "working");

          const { data: knowledgeEntries } = await adminClient.from("knowledge_entries").select("title, content, category").or(`organization_id.eq.${orgId},is_global.eq.true`);
          let knowledgeContext = "";
          if (knowledgeEntries?.length) {
            knowledgeContext = "\n\n## Knowledge Base\n" + knowledgeEntries.map((e: any) => `### ${e.title} (${e.category || "general"})\n${e.content}`).join("\n\n");
          }

          // Load agent memory — mode-filtered structured facts
          let agentMemoryContext = "";
          {
            // Prioritize mode-relevant facts
            const priorityCategories: string[] = [];
            if (effectiveMode === "drafting") priorityCategories.push("user_standard", "preference");
            else if (effectiveMode === "red_flags" || effectiveMode === "review") priorityCategories.push("document_reviewed");

            let memoryEntries: any[] = [];

            if (priorityCategories.length > 0) {
              // Load up to 7 priority entries + 5 general
              const { data: priorityData } = await adminClient.from("agent_memory").select("content, category, created_at").eq("organization_id", orgId).eq("user_id", userId).in("category", priorityCategories).order("created_at", { ascending: false }).limit(7);
              const { data: generalData } = await adminClient.from("agent_memory").select("content, category, created_at").eq("organization_id", orgId).eq("user_id", userId).not("category", "in", `(${priorityCategories.join(",")})` ).order("created_at", { ascending: false }).limit(5);
              memoryEntries = [...(priorityData || []), ...(generalData || [])];
            } else {
              const { data } = await adminClient.from("agent_memory").select("content, category, created_at").eq("organization_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
              memoryEntries = data || [];
            }

            if (memoryEntries.length) {
              agentMemoryContext = "\n\n## Agent Memory (Known Facts)\n" + memoryEntries.map((e: any) => `- [${e.category || "general"}] ${e.content}`).join("\n");
            }
          }

          let vaultName = clientVaultName || "";
          let vaultInventory = "";
          const isUploadsVault = vaultName === "Uploads" || clientVaultName === "Uploads";
          if (vaultId) {
            if (!vaultName) {
              const { data: vaultData } = await adminClient.from("vaults").select("name").eq("id", vaultId).single();
              vaultName = vaultData?.name || "";
            }
            // For Uploads vault without explicit attachedFileIds, skip vault-wide search
            if (isUploadsVault && (!attachedFileIds || attachedFileIds.length === 0)) {
              // Don't load vault inventory — user didn't attach files this message
            } else {
              const { data: vaultFiles } = await adminClient.from("files").select("name, status, size_bytes, mime_type").eq("vault_id", vaultId).eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50);
              if (vaultFiles?.length) {
                vaultInventory = `\n\n## Available Documents in Vault "${vaultName}"\n` + vaultFiles.map((f: any) => `- ${f.name} (${f.status}, ${Math.round(f.size_bytes / 1024)}KB)`).join("\n");
              }
            }
          }

          // ════════════════════════════════════
          // SHORT MESSAGE CONTEXT RESOLUTION
          // ════════════════════════════════════
          let resolvedMessage = message;
          if (message.split(/\s+/).length < 6 && conversationHistory.length > 0) {
            const lastAssistant = [...conversationHistory].reverse().find((m: any) => m.role === "assistant");
            if (lastAssistant) {
              const topicSummary = lastAssistant.content.substring(0, 200);
              resolvedMessage = `Context: "${topicSummary}"\n\nUser follow-up: ${message}`;
            }
          }

          // ════════════════════════════════════
          // PHASE 2: REQUEST TYPE CLASSIFICATION + INTENT ANALYSIS
          // ════════════════════════════════════
          const requestType = classifyRequestType(message, !!(attachedFileIds?.length), hasVault, conversationHistory, sources);
          const intent = await analyzeIntent(aiUrl, aiKey, modelId, aiHeaders, resolvedMessage, hasVault, !!needsSearch, effectiveMode);

          // Merge complexity: use max of assessed vs intent-returned
          const assessedComplexity = assessComplexity(message, { jurisdictions: intent.jurisdictions, hasVault });
          const complexity = Math.max(assessedComplexity, intent.complexityScore);

          trackStep("Analyzing your query", "done", `${intent.taskType} task, complexity ${complexity}/10`);

          // Emit intent
          emit(controller, encoder, {
            type: "intent",
            data: { taskType: intent.taskType, jurisdictions: intent.jurisdictions, complexity, approach: intent.approach },
          });

          // Emit plan — cap TYPE 1 to max 2 steps
          const currentPlan = requestType === 1 ? intent.plan.slice(0, 2) : [...intent.plan];
          emit(controller, encoder, { type: "plan", steps: currentPlan });

          // ════════════════════════════════════
          // PHASE 3: ReAct EXECUTION LOOP
          // ════════════════════════════════════
          const accumulatedContext: string[] = [];
          let allCitations: { index: number; source: string; excerpt: string; url?: string }[] = [];
          let allDomains: string[] = [];
          let allFileRefs: { name: string; id?: string }[] = [];
          const { model: initialSearchModel, reasoningEffort: initialRE } = selectPerplexityModel(complexity, !!deepResearch);
          let currentSearchModel = initialSearchModel;
          let currentRE = initialRE;
          let iteration = 0;
          let consecutiveFailures = 0;
          let vaultSearchDone = false;
          let webSearchDone = false;
          const toolAttempts: Record<string, number> = {}; // Track per-tool retry counts

          // ── HARD-CODED ROUTING based on request type ──
          const hasExplicitLegalSources = sources?.some((s: string) => ["CourtListener", "US Law", "UK Law"].includes(s));

          // Build a tool queue from user-selected sources (ensures ALL selected tools run)
          const toolQueue: string[] = [];
          if (sources?.includes("CourtListener")) toolQueue.push("courtlistener");
          if (sources?.includes("EDGAR (SEC)")) toolQueue.push("edgar");
          if (sources?.includes("EUR-Lex")) toolQueue.push("eurlex");

          let nextTool: string;

          if (toolQueue.length > 0) {
            // User explicitly selected legal tools — run the first one, queue the rest
            nextTool = toolQueue.shift()!;
          } else {
            switch (requestType) {
              case 1: // Factual — no vault, maybe web if complex
                nextTool = (complexity >= 4 && perplexityKey) ? "web_search" : "";
                break;
              case 2: // Case lookup — CourtListener first (works without key too), else web search
                nextTool = "courtlistener";
                break;
              case 3: // Document task — read files first
                nextTool = "read_files";
                break;
              case 4: // Vault task — search vault
                nextTool = "vault_search";
                break;
              case 5: // EDGAR/SEC lookup — always try EDGAR
                nextTool = "edgar";
                break;
              case 6: // EUR-Lex lookup — always try EUR-Lex
                nextTool = "eurlex";
                break;
              default:
                nextTool = "";
            }
            // Override: explicit legal sources with case query always go to web
            if (hasExplicitLegalSources && requestType === 2 && perplexityKey) {
              nextTool = "web_search";
            }
          }
          // Override: red_flags mode with vault always reads files first
          if (effectiveMode === "red_flags" && hasVault && requestType !== 2) {
            nextTool = "read_files";
          }
          let nextInput: any = { query: message };

          while (iteration < MAX_ITERATIONS && nextTool) {
            iteration++;

            const stepLabel =
              nextTool === "vault_search" ? "Searching your documents" :
              nextTool === "web_search" ? "Researching sources" :
              nextTool === "read_files" ? (attachedFileIds?.length ? "Reading attached document" : "Reading vault documents") :
              nextTool === "courtlistener" ? "Searching CourtListener" :
              nextTool === "edgar" ? "Searching SEC EDGAR" :
              nextTool === "eurlex" ? "Searching EUR-Lex" :
              "Processing";

            trackStep(stepLabel, "working");
            toolAttempts[nextTool] = (toolAttempts[nextTool] || 0) + 1;

            // Cap per-tool retries at 2 — auto-fallback to web search
            if (toolAttempts[nextTool] > 2 && nextTool !== "web_search" && nextTool !== "vault_search" && nextTool !== "read_files") {
              console.warn(`Tool ${nextTool} exceeded 2 attempts, falling back to web search`);
              trackStep(stepLabel, "done", "Falling back to web search");
              if (perplexityKey && !webSearchDone) {
                nextTool = "web_search";
                nextInput = { query: `site:${nextTool === "courtlistener" ? "courtlistener.com" : nextTool === "edgar" ? "sec.gov" : "eur-lex.europa.eu"} ${message}` };
                continue;
              }
              break;
            }

            let toolResult: ToolResult;
            try {
              // Decompose queries for multi-search (except vault/read_files)
              const useDecomposition = ["courtlistener", "edgar", "eurlex", "web_search"].includes(nextTool);
              const subQueries = useDecomposition
                ? decomposeSearchQueries(nextInput.query || message, nextTool, intent.jurisdictions, requestType)
                : [nextInput.query || message];

              switch (nextTool) {
                case "vault_search":
                  emitThinking("Embedding query and searching document vectors for relevant passages...");
                  toolResult = await toolVaultSearch(nextInput.query || message, orgId, vaultId, attachedFileIds, qdrantConf, openaiConf, embeddingModel, adminClient);
                  vaultSearchDone = true;
                  if (toolResult.fileRefs.length > 0) emit(controller, encoder, { type: "file_refs", files: toolResult.fileRefs });
                  break;

                case "web_search": {
                  if (!perplexityKey) {
                    toolResult = { context: "", citations: [], domains: [], fileRefs: [], summary: "No search API configured" };
                  } else {
                    // Select per-query Perplexity model based on complexity
                    const { model: queryModel, reasoningEffort: queryRE } = selectPerplexityModel(complexity, !!deepResearch);

                    if (subQueries.length > 1) {
                      emitThinking(`Executing ${subQueries.length} targeted searches...`);
                    } else {
                      emitThinking(`Searching across legal databases...`);
                    }

                    // Execute sub-queries and merge results
                    const mergedResult: ToolResult = { context: "", citations: [], domains: [], fileRefs: [], summary: "" };
                    const seenUrls = new Set<string>();

                    for (const sq of subQueries) {
                      const partial = await toolWebSearch(sq, perplexityKey, queryModel, sources, intent.jurisdictions, queryRE);
                      if (partial.context) mergedResult.context += partial.context + "\n\n";
                      // Deduplicate citations by URL
                      for (const c of partial.citations) {
                        if (c.url && seenUrls.has(c.url)) continue;
                        if (c.url) seenUrls.add(c.url);
                        mergedResult.citations.push({ ...c, index: mergedResult.citations.length + 1 });
                      }
                      mergedResult.domains.push(...partial.domains);
                    }
                    mergedResult.domains = [...new Set(mergedResult.domains)];
                    mergedResult.summary = `Found ${mergedResult.citations.length} sources from ${subQueries.length} searches`;

                    toolResult = mergedResult;
                    webSearchDone = true;
                    if (toolResult.domains.length > 0) {
                      emit(controller, encoder, { type: "sources", urls: toolResult.citations.map(c => c.url).filter(Boolean), domains: toolResult.domains });
                    }
                  }
                  break;
                }

                case "read_files":
                  emitThinking("Reading document contents directly...");
                  toolResult = await toolReadFiles(orgId, vaultId, attachedFileIds, adminClient);
                  if (toolResult.fileRefs.length > 0) emit(controller, encoder, { type: "file_refs", files: toolResult.fileRefs });
                  break;

                case "courtlistener": {
                  emitThinking(`Searching CourtListener with ${subQueries.length} targeted queries...`);
                  const mergedResult: ToolResult = { context: "", citations: [], domains: ["courtlistener.com"], fileRefs: [], summary: "" };
                  const seenUrls = new Set<string>();

                  for (const sq of subQueries) {
                    const partial = await toolCourtListener(sq, courtListenerKey);
                    if (partial.context) mergedResult.context += partial.context + "\n\n";
                    for (const c of partial.citations) {
                      if (c.url && seenUrls.has(c.url)) continue;
                      if (c.url) seenUrls.add(c.url);
                      mergedResult.citations.push({ ...c, index: mergedResult.citations.length + 1 });
                    }
                  }
                  mergedResult.summary = `${mergedResult.citations.length} cases found from ${subQueries.length} queries`;
                  toolResult = mergedResult;

                  if (toolResult.domains.length > 0) {
                    emit(controller, encoder, { type: "sources", urls: toolResult.citations.map(c => c.url).filter(Boolean), domains: toolResult.domains });
                  }
                  break;
                }

                case "edgar": {
                  emitThinking(`Searching SEC EDGAR with ${subQueries.length} targeted queries...`);
                  const mergedResult: ToolResult = { context: "", citations: [], domains: ["sec.gov"], fileRefs: [], summary: "" };
                  const seenUrls = new Set<string>();

                  for (const sq of subQueries) {
                    const partial = await toolEdgar(sq, edgarUserAgent);
                    if (partial.context) mergedResult.context += partial.context + "\n\n";
                    for (const c of partial.citations) {
                      if (c.url && seenUrls.has(c.url)) continue;
                      if (c.url) seenUrls.add(c.url);
                      mergedResult.citations.push({ ...c, index: mergedResult.citations.length + 1 });
                    }
                  }
                  mergedResult.summary = `${mergedResult.citations.length} filings found from ${subQueries.length} queries`;
                  toolResult = mergedResult;

                  if (toolResult.domains.length > 0) {
                    emit(controller, encoder, { type: "sources", urls: toolResult.citations.map(c => c.url).filter(Boolean), domains: toolResult.domains });
                  }
                  break;
                }

                case "eurlex": {
                  emitThinking(`Searching EUR-Lex with ${subQueries.length} targeted queries...`);
                  const mergedResult: ToolResult = { context: "", citations: [], domains: ["eur-lex.europa.eu"], fileRefs: [], summary: "" };
                  const seenUrls = new Set<string>();

                  for (const sq of subQueries) {
                    const partial = await toolEurLex(sq);
                    if (partial.context) mergedResult.context += partial.context + "\n\n";
                    for (const c of partial.citations) {
                      if (c.url && seenUrls.has(c.url)) continue;
                      if (c.url) seenUrls.add(c.url);
                      mergedResult.citations.push({ ...c, index: mergedResult.citations.length + 1 });
                    }
                  }
                  mergedResult.summary = `${mergedResult.citations.length} EU law results from ${subQueries.length} queries`;
                  toolResult = mergedResult;

                  if (toolResult.domains.length > 0) {
                    emit(controller, encoder, { type: "sources", urls: toolResult.citations.map(c => c.url).filter(Boolean), domains: toolResult.domains });
                  }
                  break;
                }

                default:
                  toolResult = { context: "", citations: [], domains: [], fileRefs: [], summary: "Unknown tool" };
              }
              consecutiveFailures = 0;
            } catch (err: any) {
              console.error(`Tool ${nextTool} error:`, err);
              consecutiveFailures++;
              toolResult = { context: "", citations: [], domains: [], fileRefs: [], summary: `Error: ${err.message}` };
              if (consecutiveFailures >= 3) {
                trackStep(stepLabel, "done", "Failed after retries");
                break;
              }
            }

            // Accumulate results
            if (toolResult.context) accumulatedContext.push(toolResult.context);
            // Re-index citations to avoid collisions
            const citationOffset = allCitations.length;
            toolResult.citations.forEach(c => { allCitations.push({ ...c, index: citationOffset + c.index }); });
            allDomains.push(...toolResult.domains);
            allFileRefs.push(...toolResult.fileRefs);

            trackStep(stepLabel, "done", toolResult.summary);

            // ══ FORCE FINISH when attached files have been read ══
            // If the user explicitly attached files and we just read them, skip monologue entirely.
            // The monologue tends to suggest vault_search or ask "which document?" — bypass it completely.
            if (attachedFileIds?.length && nextTool === "read_files" && toolResult.context) {
              emitThinking("Documents loaded. Preparing analysis...");
              // But if there are queued legal tools, run those first
              if (toolQueue.length > 0) {
                nextTool = toolQueue.shift()!;
                continue;
              }
              break;
            }

            // ══ QUEUED TOOLS: run remaining legal tools before monologue decides ══
            if (toolQueue.length > 0) {
              nextTool = toolQueue.shift()!;
              nextInput = { query: message };
              continue;
            }

            // ── INNER MONOLOGUE ──
            const monologue = await innerMonologue(aiUrl, aiKey, modelId, aiHeaders, message, currentPlan, accumulatedContext, toolResult, iteration, currentPlan.length, attachedFileNames);

            emitThinking(monologue.thinking_narration);

            // Emit progress — cap current to never exceed total
            const progressTotal = Math.max(iteration, currentPlan.length);
            emit(controller, encoder, { type: "progress", current: Math.min(iteration, progressTotal), total: progressTotal });

            // Handle escalation
            if (monologue.search_model && monologue.search_model !== currentSearchModel && perplexityKey) {
              const friendlyFrom = currentSearchModel === "sonar-deep-research" ? "Deep Research" : currentSearchModel === "sonar-pro" ? "Pro Search" : "Fast Search";
              const friendlyTo = monologue.search_model === "sonar-deep-research" ? "Deep Research" : monologue.search_model === "sonar-pro" ? "Pro Search" : "Fast Search";
              emit(controller, encoder, { type: "escalation", data: { from: friendlyFrom, to: friendlyTo, reason: "Initial results insufficient" } });
              currentSearchModel = monologue.search_model;
              currentRE = monologue.search_model === "sonar-deep-research" ? "high" : undefined;
            }

            // Handle plan update
            if (monologue.next_action === "REPLAN" && monologue.replan_steps?.length) {
              currentPlan.length = 0;
              currentPlan.push(...monologue.replan_steps);
              emit(controller, encoder, { type: "plan_update", steps: currentPlan, reason: monologue.replan_reason || "Plan updated based on findings" });
            }

            // Handle contradiction
            if (monologue.contradiction) {
              emit(controller, encoder, { type: "contradiction", data: monologue.contradiction });
            }

            // Handle inline data
            if (monologue.inline_data) {
              emit(controller, encoder, { type: "inline_data", data: monologue.inline_data });
            }

            // Handle verification
            if (monologue.next_action === "VERIFY" && monologue.verify_claim && perplexityKey) {
              emit(controller, encoder, { type: "verify_start", claim: monologue.verify_claim });
              try {
                const verifyResult = await toolWebSearch(monologue.verify_claim, perplexityKey, "sonar", undefined, intent.jurisdictions);
                const verified = verifyResult.context.length > 50;
                emit(controller, encoder, { type: "verify_end", claim: monologue.verify_claim, verified, source: verifyResult.summary });
                if (verifyResult.context) accumulatedContext.push(verifyResult.context);
                verifyResult.citations.forEach(c => { allCitations.push({ ...c, index: allCitations.length + c.index }); });
              } catch {
                emit(controller, encoder, { type: "verify_end", claim: monologue.verify_claim, verified: false, source: "Verification failed" });
              }
              // After verify, continue loop — inner monologue on next iteration will decide
              nextTool = "";
              nextInput = { query: message };

              // Re-run monologue to decide next step
              const postVerify = await innerMonologue(aiUrl, aiKey, modelId, aiHeaders, message, currentPlan, accumulatedContext, toolResult, iteration, currentPlan.length, attachedFileNames);
              if (postVerify.next_action === "FINISH") break;
              nextTool = postVerify.next_tool || "";
              nextInput = postVerify.next_tool_input || { query: message };
              continue;
            }

            // Decide next action
            // HARD GUARD: If explicit files are attached, only allow web_search (never vault_search or read_files again)
            if (attachedFileIds?.length) {
              if (monologue.next_action === "FINISH") {
                nextTool = "";
              } else if (monologue.next_tool === "web_search" && !webSearchDone && perplexityKey) {
                nextTool = "web_search";
                nextInput = monologue.next_tool_input || { query: message };
              } else {
                // Force finish — don't let monologue loop with vault_search or read_files
                nextTool = "";
              }
            } else {
              // Check vault fallback: if vault returned irrelevant results, auto-switch to web
              const vaultWasIrrelevant = monologue.vault_result_relevant === false;
              if (monologue.next_action === "FINISH" && !vaultWasIrrelevant) {
                nextTool = "";
              } else if (vaultWasIrrelevant && !webSearchDone && perplexityKey) {
                nextTool = "web_search";
                nextInput = monologue.next_tool_input || { query: message };
                emitThinking("Document results not relevant to query. Searching online sources...");
                allCitations = allCitations.filter(c => c.url);
                allFileRefs = [];
              } else if (monologue.next_action === "TOOL" && monologue.next_tool) {
                // Blacklist tools that exceeded retry cap
                if ((toolAttempts[monologue.next_tool] || 0) >= 2) {
                  // Don't let monologue re-queue a failed tool
                  if (perplexityKey && !webSearchDone) {
                    nextTool = "web_search";
                    nextInput = { query: `site:${monologue.next_tool === "courtlistener" ? "courtlistener.com" : "sec.gov"} ${message}` };
                  } else {
                    nextTool = "";
                  }
                } else {
                  nextTool = monologue.next_tool;
                  nextInput = monologue.next_tool_input || { query: message };
                }
              } else {
                if (!vaultSearchDone && hasVault) { nextTool = "vault_search"; }
                else if (!webSearchDone && perplexityKey) { nextTool = "web_search"; }
                else { nextTool = ""; }
              }
            }
          }

          // ════════════════════════════════════
          // PHASE 4: SELF-VERIFICATION
          // ════════════════════════════════════
          if (accumulatedContext.length > 0 && complexity >= 3) {
            emit(controller, encoder, { type: "self_check", status: "running" });
            const check = await selfVerify(aiUrl, aiKey, modelId, aiHeaders, message, currentPlan, accumulatedContext);
            if (!check.passed && iteration < MAX_ITERATIONS) {
              emit(controller, encoder, { type: "self_check", status: "failed" });
              emitThinking(`Self-check: ${check.reason}. Doing additional research...`);
              // One more search attempt
              if (perplexityKey && !webSearchDone) {
                trackStep("Additional research", "working");
                const extra = await toolWebSearch(message, perplexityKey, "sonar-pro", sources, intent.jurisdictions);
                if (extra.context) accumulatedContext.push(extra.context);
                extra.citations.forEach(c => { allCitations.push({ ...c, index: allCitations.length + c.index }); });
                allDomains.push(...extra.domains);
                trackStep("Additional research", "done", extra.summary);
              }
            }
            emit(controller, encoder, { type: "self_check", status: "passed" });
          }

          // ════════════════════════════════════
          // PHASE 5: BUILD SYSTEM PROMPT & SYNTHESIZE
          // ════════════════════════════════════
          // Emit final progress count
          emit(controller, encoder, { type: "progress", current: currentPlan.length, total: currentPlan.length });

          trackStep("Synthesizing response", "working");

          // Mode-specific prompts (preserved from original)
          let customPrompt = "";
          if (effectiveMode && agentConf.prompts?.[effectiveMode]) {
            customPrompt = agentConf.prompts[effectiveMode];
          } else {
            customPrompt = agentConf.prompts?.chat || "";
          }

          const followUpInstruction = `\n\nIMPORTANT: At the end of your response, always suggest 3 relevant follow-up questions the user might want to ask. Format each as ">>FOLLOWUP: [question]" on its own line. Make them specific and actionable based on the conversation context.`;

          const redFlagModePrompt = effectiveMode === "red_flags" ? `
You are LawKit AI performing Red Flag Analysis.

CRITICAL GROUNDING RULE: You MUST analyze ONLY the document content provided in the '## Document Contents' section below. Do not reference any other documents from memory, training data, or previous sessions. If the document content references parties, terms, dates, or jurisdictions, use ONLY those exact details. Never fabricate or substitute party names, dates, or clause text.

Read the ENTIRE provided document carefully. For every risky, unusual, or potentially unfavorable clause:

OUTPUT FORMAT — you MUST use this exact format:
<!-- REDFLAGS: [Document Title] -->
\`\`\`json
{
  "flags": [
    {
      "clause_text": "exact verbatim quote from the document — copy word for word",
      "risk_level": "CRITICAL|HIGH|MEDIUM|LOW",
      "category": "liability|IP|termination|payment|governance|data_protection|confidentiality|indemnification|non_compete|representations",
      "reason": "Clear explanation of why this clause is risky",
      "suggested_edit": "Specific rewrite of the clause to address the risk"
    }
  ],
  "summary": {
    "total": N,
    "critical": N,
    "high": N,
    "medium": N,
    "low": N,
    "risk_score": N  // overall risk score 0-10. This is a holistic assessment, NOT a sum of individual flags. 0=no risk, 10=extreme risk.
  }
}
\`\`\`

Risk levels:
- CRITICAL = must fix before signing, creates serious legal exposure
- HIGH = strongly recommended to fix, significant risk
- MEDIUM = worth negotiating, moderate concern
- LOW = minor issue, note only

JURISDICTION RULE: Only flag governing law as a risk if the jurisdiction is clearly mismatched with the parties' stated locations, or if the jurisdiction is unusual for the contract type. Do NOT flag a jurisdiction simply because it differs from England and Wales — assess based on the parties involved.

Before the REDFLAGS block, write a brief 2-3 sentence overview of the document and overall risk assessment.
After the REDFLAGS block, write ONLY key recommendations that are DIFFERENT from the overview. Do NOT repeat the overview paragraph. Keep recommendations actionable and specific.
${followUpInstruction}
` : "";

          const draftingModePrompt = effectiveMode === "drafting" ? `
You are LawKit AI, an expert legal document drafting assistant.
CRITICAL RULES:
- You MUST generate a complete, properly formatted legal document. NEVER output JSON, extraction data, or structured data.
- Start your response with "# [Document Title]" as the FIRST line. Do NOT include any conversational preamble, explanations, caveats, "as an AI..." text, or any text before the document title heading. The very first character of your output must be "#".
- Use proper legal formatting: numbered sections (1., 1.1, 1.2), subsections, defined terms in **bold**, signature blocks.
- Fill in ALL details using user info and org context. NEVER use placeholder text like [PARTY NAME].
- Include all standard clauses expected for the document type.
- RESEARCH jurisdiction requirements BEFORE drafting — ensure compliance with applicable laws.
- Unless the user specifies a jurisdiction, always draft under the laws of England and Wales with exclusive jurisdiction of the courts of England and Wales. Never default to US law (California, New York, etc.).
- End the document with a "## Drafting Notes" section explaining key decisions, assumptions made, and any areas requiring client review.
- Use clear modern legal language — avoid archaic legalese.
- When the user requests multiple documents (e.g., "write 5 NDAs"), draft ALL of them in sequence within the same response. Use placeholder party names (Vendor 1, Vendor 2, Party A, etc.), England and Wales as default governing law, and 2-year confidentiality period as default unless specified. List all assumptions in the Drafting Notes at the end.
- NEVER say "I can only generate one document at a time". Generate as many documents as requested.
- Only ask for clarification if ZERO information was provided about the document type or purpose. If the user has specified a purpose, document type, or said details should be random/varied, proceed immediately with reasonable defaults and placeholders. Never ask for information the user has already implicitly or explicitly provided.
${followUpInstruction}
` : "";

          const reviewModePrompt = effectiveMode === "review" ? `
You are LawKit AI, an expert legal data extraction assistant.
CRITICAL: Output using the <!-- SHEET: --> format ONLY. Never use markdown tables.
${existingSheetJson ? `Current sheet (modify, don't replace):\n\`\`\`json\n${existingSheetJson}\n\`\`\`\n` : ""}
Format:
<!-- SHEET: Title -->
\`\`\`json
{"columns":[{"name":"Col","type":"free_response","query":"..."}],"rows":[{"fileName":"f.pdf","status":"completed","values":{"Col":"val"}}]}
\`\`\`
Column types: "free_response", "date", "classification", "verbatim", "number"

## EXTRACTION GROUNDING RULES (MANDATORY)

### Rule 1 — NOT FOUND (prevents all fabrication)
For every cell you extract, you MUST be able to quote a verbatim sentence from the document.
If you cannot quote a verbatim sentence → the value does not exist in this document.
If a field is absent, return the value as: "NOT FOUND IN DOCUMENT"
NEVER infer, estimate, or use training data to fill a cell.
NEVER populate a cell you cannot directly quote from the document.

### Rule 2 — Governing Law Grounding (prevents jurisdiction hallucination)
WHEN extracting Governing Law:
Only read the explicit governing law clause — typically in a final section titled "Governing Law" or "Governing Law and Jurisdiction".
DO NOT infer governing law from the investor's address, the LP's name or nationality, the currency used, or any other contextual signal.
If no explicit clause exists → return NOT FOUND IN DOCUMENT.

### Rule 3 — Document Type Awareness (prevents inventing clauses)
WHEN processing LP side letters:
These documents contain: economic terms, MFN rights, co-investment rights, reporting rights, key person provisions, governing law.
These documents DO NOT contain: liability caps, auto-renewal clauses, termination notice periods, indemnification terms. These live in the LPA itself.
If asked to extract an absent clause type → return NOT FOUND IN DOCUMENT.
DO NOT invent typical values. DO NOT infer from the LPA.

### Rule 4 — Payment Term Precision
WHEN extracting payment terms, extract all sub-values separately:
- Management fee (Investment Period)
- Management fee (post-Investment Period)
- Carried interest rate
- Hurdle / preferred return rate
- Management fee offset % (only if explicitly stated)
DO NOT use industry-standard or typical values.
Omit any sub-value not stated in the document.

### Rule 5 — Per-Document Independence (prevents context drift)
Apply ALL grounding rules independently for EACH document. Do not let the extraction from document 1 influence document 2.
Do not infer any document's governing law from LP identity, address, or nationality.
Each document must be read as if it is the only document you have ever seen.
The governing law of document 1 has ZERO bearing on document 2. Re-read the governing law clause fresh for each document.

### Rule 6 — Self-Verification (prevents hallucination)
After extracting governing law from each document, state the verbatim sentence you found in a "verification" field in the row values.
If the verbatim sentence does not contain the jurisdiction you extracted, your extraction is wrong — re-read the document.
Format: "values": { "Governing Law": "laws of England and Wales", "Governing Law Verification": "This Agreement shall be governed by and construed in accordance with the laws of England and Wales." }

${followUpInstruction}
` : "";

          let documentEditingContext = "";
          if (currentDocumentContent) {
            documentEditingContext = `\n\n## Currently Open Document (VERSION UPDATE MODE)\nWhen the user asks to modify a document, output the COMPLETE updated document as markdown starting with "# [Same Title]".\nNEVER output JSON operations, file_path objects, or structured edit instructions. Always output the full updated document text.\nUPDATE the existing document, do NOT create new.\n\nCurrent:\n${currentDocumentContent.substring(0, 10000)}`;
          }

          const basePrompt = customPrompt || getLawKitBasePrompt(
            intent.jurisdictions, knowledgeContext, orgData?.name || "Unknown",
            profile.full_name || profile.email || "Unknown", profile.email || ""
          );

          const allContext = accumulatedContext.join("\n");
          const effectiveBasePrompt = redFlagModePrompt || draftingModePrompt || reviewModePrompt || (basePrompt + followUpInstruction);
          let finalSystemPrompt = effectiveBasePrompt;
          if (workflowSystemPrompt) finalSystemPrompt = workflowSystemPrompt + "\n\n" + finalSystemPrompt;
          finalSystemPrompt += `\n${knowledgeContext}\n${agentMemoryContext}\n${vaultInventory}\n${allContext}\n${documentEditingContext}`;

          // Inject explicit attachment context into synthesis prompt
          if (attachedFileIds?.length && attachedFileNames?.length) {
            finalSystemPrompt += `\n\n## EXPLICIT ATTACHMENTS\nThe user explicitly attached these files for analysis: ${attachedFileNames.join(", ")}. Analyze ALL attached files directly. Do NOT ask which file to analyze. Do NOT search the vault for other files. The attached files ARE your scope.`;
          }

          // Build messages
          const aiMessages = [
            { role: "system", content: finalSystemPrompt },
            ...conversationHistory.map((m: any) => ({ role: m.role, content: m.content })),
            { role: "user", content: message },
          ];

          // Save user message
          if (conversationId && conversationId !== "column-fill") {
            await adminClient.from("messages").insert({ conversation_id: conversationId, organization_id: orgId, role: "user", content: message });
          }

          // Stream final synthesis
          const aiResponse = await fetch(aiUrl, {
            method: "POST",
            headers: aiHeaders,
            body: JSON.stringify({ model: modelId, messages: aiMessages, stream: true, max_tokens: effectiveMode === "drafting" ? 16384 : (deepResearch ? 16000 : 8000), temperature: 0.3 }),
          });

          if (!aiResponse.ok) {
            const status = aiResponse.status;
            const errText = await aiResponse.text();
            console.error("AI gateway error:", status, errText);
            let errorMsg = "AI service temporarily unavailable.";
            if (status === 429) errorMsg = "Rate limit exceeded. Please try again in a moment.";
            if (status === 402) errorMsg = "Usage limit reached. Please add credits.";
            emit(controller, encoder, { type: "error", error: errorMsg });
            controller.close();
            return;
          }

          trackStep("Synthesizing response", "done");

          // Emit final_answer divider marker
          emit(controller, encoder, { type: "final_answer_start" });

          // Stream tokens
          const reader = aiResponse.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";
          let reasoningContent = "";
          let buffer = "";
          let inThinkBlock = false;
          let firstTokensBuffer = ""; // Buffer first tokens to strip bad openers
          let firstTokensEmitted = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  let remaining = content;
                  while (remaining.length > 0) {
                    if (inThinkBlock) {
                      const closeIdx = remaining.indexOf("</think>");
                      if (closeIdx !== -1) {
                        reasoningContent += remaining.slice(0, closeIdx);
                        emit(controller, encoder, { type: "reasoning", content: remaining.slice(0, closeIdx) });
                        remaining = remaining.slice(closeIdx + 8);
                        inThinkBlock = false;
                      } else {
                        reasoningContent += remaining;
                        emit(controller, encoder, { type: "reasoning", content: remaining });
                        remaining = "";
                      }
                    } else {
                      const openIdx = remaining.indexOf("<think>");
                      if (openIdx !== -1) {
                        const before = remaining.slice(0, openIdx);
                        if (before) { fullContent += before; emit(controller, encoder, { type: "token", content: before }); }
                        remaining = remaining.slice(openIdx + 7);
                        inThinkBlock = true;
                      } else {
                        // Post-processing: buffer first ~150 chars to strip bad openers
                        if (!firstTokensEmitted) {
                          firstTokensBuffer += remaining;
                          fullContent += remaining;
                          remaining = "";
                          if (firstTokensBuffer.length >= 150) {
                            // Check and strip bad openers
                            let cleaned = firstTokensBuffer;
                            const badOpenerMatch = cleaned.match(/^(I don't have sufficient information[^.]*\.|I do not have sufficient[^.]*\.|My internal knowledge[^.]*\.|Unfortunately,? I[^.]*\.)\s*/i);
                            if (badOpenerMatch) {
                              cleaned = cleaned.slice(badOpenerMatch[0].length);
                              // Also fix fullContent
                              fullContent = fullContent.slice(badOpenerMatch[0].length);
                            }
                            emit(controller, encoder, { type: "token", content: cleaned });
                            firstTokensEmitted = true;
                          }
                        } else {
                          fullContent += remaining;
                          emit(controller, encoder, { type: "token", content: remaining });
                        }
                        remaining = "";
                      }
                    }
                  }
                }
              } catch { /* partial JSON */ }
            }
          }

          // Flush any remaining buffered first tokens
          if (!firstTokensEmitted && firstTokensBuffer.length > 0) {
            let cleaned = firstTokensBuffer;
            const badOpenerMatch = cleaned.match(/^(I don't have sufficient information[^.]*\.|I do not have sufficient[^.]*\.|My internal knowledge[^.]*\.|Unfortunately,? I[^.]*\.)\s*/i);
            if (badOpenerMatch) {
              cleaned = cleaned.slice(badOpenerMatch[0].length);
              fullContent = fullContent.slice(badOpenerMatch[0].length);
            }
            emit(controller, encoder, { type: "token", content: cleaned });
          }

          // Extract follow-ups
          const followUps: string[] = [];
          fullContent.split("\n").filter(l => l.startsWith(">>FOLLOWUP: ")).forEach(l => {
            const q = l.replace(">>FOLLOWUP: ", "").trim();
            if (q) followUps.push(q);
          });
          const cleanedContent = fullContent.split("\n").filter(l => !l.startsWith(">>FOLLOWUP: ")).join("\n").trim();

          // Merge citations
          const vaultCitations = extractCitations(cleanedContent, allContext);
          const mergedCitations = [...vaultCitations, ...allCitations];
          const uniqueCitations = Array.from(new Map(mergedCitations.map(c => [c.index, c])).values());

          // Emit done
          emit(controller, encoder, { type: "done", citations: uniqueCitations, model: modelId, followUps });

          // ════════════════════════════════════
          // PHASE 6: PERSIST METADATA
          // ════════════════════════════════════
          const collectedSteps: any[] = [];
          for (const [name] of stepStartTimes) {
            const s = stepStartTimes.get(name);
            collectedSteps.push({ name, status: "done", duration: s ? `${Math.round((Date.now() - s) / 1000)}s` : undefined });
          }

          const messageMetadata: any = {};
          if (collectedSteps.length > 0) messageMetadata.frozenSteps = collectedSteps;
          if (currentPlan.length > 0) messageMetadata.frozenPlan = currentPlan;
          if (accumulatedThinkingText) messageMetadata.frozenThinkingText = accumulatedThinkingText;
          if (reasoningContent) messageMetadata.frozenReasoning = reasoningContent;
          if (followUps.length > 0) messageMetadata.followUps = followUps;
          if (allDomains.length > 0) {
            messageMetadata.frozenSearchSources = { urls: allCitations.filter(c => c.url).map(c => c.url), domains: [...new Set(allDomains)] };
          }
          if (allFileRefs.length > 0) messageMetadata.frozenFileRefs = allFileRefs;
          messageMetadata.agentMeta = {
            iterations: iteration,
            complexity,
            jurisdictions: intent.jurisdictions,
            searchModelsUsed: "internal",
            taskType: intent.taskType,
          };

          if (conversationId && conversationId !== "column-fill") {
            await adminClient.from("messages").insert({
              conversation_id: conversationId, organization_id: orgId, role: "assistant",
              content: cleanedContent, model_used: modelId,
              citations: uniqueCitations.length > 0 ? uniqueCitations : null,
              metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : null,
            });

            const { count } = await adminClient.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", conversationId);
            if (count && count <= 2) {
              const title = cleanedContent.substring(0, 60).replace(/[#*\n]/g, "").trim() + (cleanedContent.length > 60 ? "..." : "");
              await adminClient.from("conversations").update({ title }).eq("id", conversationId);
            }
          }

          // ════════════════════════════════════
          // PHASE 7: SAVE AGENT MEMORY
          // ════════════════════════════════════
          try {
            const memoryResp = await fetch(aiUrl, {
              method: "POST",
              headers: aiHeaders,
              body: JSON.stringify({
                model: modelId,
                messages: [
                  { role: "system", content: `Extract key legal facts from this conversation exchange as a JSON array. Each fact should be an object with: {type, field, value, source_doc?}.
Types: "user_standard" (user's stated standard terms/preferences), "document_reviewed" (key facts from reviewed documents), "decision_made" (decisions or conclusions reached), "preference" (user workflow/style preferences).
Only extract CONCRETE facts: specific durations, jurisdictions, names, rates, amounts, dates, governing laws.
Skip generic observations like "user asked about NDAs" — only save facts that would be useful in future sessions.
If no concrete facts exist, output an empty array: []
Output ONLY the JSON array, no other text.` },
                  { role: "user", content: `User: ${message}\n\nAssistant: ${cleanedContent.substring(0, 3000)}` },
                ],
                max_tokens: 500,
                temperature: 0,
              }),
            });
            if (memoryResp.ok) {
              const memData = await memoryResp.json();
              const memoryRaw = memData.choices?.[0]?.message?.content?.trim();
              if (memoryRaw) {
                try {
                  // Parse JSON array of facts
                  const jsonMatch = memoryRaw.match(/\[[\s\S]*\]/);
                  const facts = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
                  if (Array.isArray(facts) && facts.length > 0) {
                    for (const fact of facts) {
                      if (!fact.field || !fact.value) continue;
                      const factContent = `${fact.field}: ${fact.value}${fact.source_doc ? ` (from: ${fact.source_doc})` : ""}`;
                      const category = fact.type || "general";

                      // Supersession: delete existing entries with the same field for this user
                      const { data: existing } = await adminClient.from("agent_memory")
                        .select("id, content")
                        .eq("organization_id", orgId)
                        .eq("user_id", userId)
                        .ilike("content", `${fact.field}:%`)
                        .limit(5);
                      if (existing?.length) {
                        await adminClient.from("agent_memory").delete().in("id", existing.map((e: any) => e.id));
                      }

                      await adminClient.from("agent_memory").insert({
                        organization_id: orgId, user_id: userId, content: factContent, category,
                      });
                    }
                    // Prune old entries — keep only last 50 per user
                    const { data: oldEntries } = await adminClient.from("agent_memory").select("id").eq("organization_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }).range(50, 1000);
                    if (oldEntries?.length) {
                      await adminClient.from("agent_memory").delete().in("id", oldEntries.map((e: any) => e.id));
                    }
                  }
                } catch (parseErr) {
                  // Fallback: save as-is if JSON parse fails
                  await adminClient.from("agent_memory").insert({
                    organization_id: orgId, user_id: userId, content: memoryRaw.substring(0, 500), category: intent.taskType || "general",
                  });
                }
              }
            }
          } catch (memErr) {
            console.error("Agent memory save error:", memErr);
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          emit(controller, encoder, { type: "error", error: "Stream interrupted" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (e) {
    console.error("llm-router error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ──────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "\u2070": "0", "\u00b9": "1", "\u00b2": "2", "\u00b3": "3", "\u2074": "4",
  "\u2075": "5", "\u2076": "6", "\u2077": "7", "\u2078": "8", "\u2079": "9",
};

function extractCitations(content: string, vaultContext: string): { index: number; source: string; excerpt: string }[] {
  const citations: { index: number; source: string; excerpt: string }[] = [];
  const seen = new Set<number>();

  // Count how many actual document sections exist in vault context to know valid index range
  const maxDocIndex = (vaultContext.match(/### \[\d+\]/g) || []).length;

  for (const match of content.matchAll(/\[(\d+)\]/g)) {
    const idx = parseInt(match[1]);
    if (seen.has(idx)) continue;

    // YEAR BRACKET GUARD: Skip numbers that look like years (1900-2099) unless they're within valid citation range
    if (idx >= 1900 && idx <= 2099 && idx > maxDocIndex && idx > 50) continue;

    seen.add(idx);
    const docMatch = vaultContext.match(new RegExp(`### \\[${idx}\\] (.+?)\\n([\\s\\S]*?)(?=### \\[|$)`));
    // Only create citation if we have a matching document section OR the index is within known range
    if (docMatch) {
      citations.push({ index: idx, source: docMatch[1], excerpt: docMatch[2]?.substring(0, 200)?.trim() || "" });
    } else if (idx <= maxDocIndex || idx <= 30) {
      // Reasonable citation index — keep as fallback
      citations.push({ index: idx, source: `Source ${idx}`, excerpt: "" });
    }
    // Skip large numbers with no matching doc (likely year brackets like [2015], [2022])
  }

  for (const match of content.matchAll(/[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+/g)) {
    const digits = match[0].split("").map(c => SUPERSCRIPT_DIGITS[c] || c).join("");
    const idx = parseInt(digits);
    if (isNaN(idx) || seen.has(idx)) continue;
    if (idx >= 1900 && idx <= 2099 && idx > maxDocIndex && idx > 50) continue;
    seen.add(idx);
    const docMatch = vaultContext.match(new RegExp(`### \\[${idx}\\] (.+?)\\n([\\s\\S]*?)(?=### \\[|$)`));
    if (docMatch) {
      citations.push({ index: idx, source: docMatch[1], excerpt: docMatch[2]?.substring(0, 200)?.trim() || "" });
    } else if (idx <= maxDocIndex || idx <= 30) {
      citations.push({ index: idx, source: `Source ${idx}`, excerpt: "" });
    }
  }

  return citations;
}

async function embedQuery(text: string, apiKey: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: [text], model }),
  });
  if (!resp.ok) throw new Error(`Embedding error: ${resp.status}`);
  const data = await resp.json();
  return data.data[0].embedding;
}
