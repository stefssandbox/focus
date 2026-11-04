// Focus · optionele AI-functie (Netlify Functions v2), bereikbaar op /api/ai.
// Zonder deze functie werkt Focus gewoon: de app valt dan terug op "briefing kopiëren".
// Instellen in Netlify → Site configuration → Environment variables:
//   ANTHROPIC_API_KEY  verplicht   API-sleutel van Anthropic
//   AI_MODEL           aanbevolen  model-ID, controleer de actuele naam in de Anthropic-console
//   ALLOWED_EMAILS     aanbevolen  komma-gescheiden e-mailadressen die AI mogen gebruiken
// Alleen ingelogde Focus-gebruikers (Supabase-sessie) kunnen de functie aanroepen.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://wmkicxbmutazwiojnyxw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_mV08JMLyMRN1r03R13za0A_MAZLYFt6";
const SYSTEM = "Je bent een kritische sparringpartner voor OKR's. Baseer je uitsluitend op de meegegeven context. Verzin nooit voortgang, bewijs, besluiten of resultaten. Maak onderscheid tussen uitvoering (acties) en uitkomst (Key Results). Antwoord in het Nederlands, kort en concreet.";
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "alleen POST" });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "AI is niet geconfigureerd" });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "log in om AI te gebruiken" });
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
  if (!u.ok) return json(401, { error: "sessie ongeldig" });
  const user = await u.json();
  const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(user.email || "").toLowerCase())) return json(403, { error: "geen toegang" });
  let prompt = "";
  try { prompt = String((await req.json()).prompt || ""); } catch { return json(400, { error: "ongeldige aanvraag" }); }
  if (!prompt || prompt.length > 60000) return json(400, { error: "prompt ontbreekt of is te lang" });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.AI_MODEL || "claude-sonnet-4-5", max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) return json(502, { error: `AI-dienst gaf ${r.status}` });
  const data = await r.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  return json(200, { text });
};

export const config = { path: "/api/ai" };
