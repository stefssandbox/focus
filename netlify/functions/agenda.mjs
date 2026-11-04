// Focus · agenda-abonnement voor Outlook.
// GET /agenda/<token>.ics → iCalendar met de ingeplande focusblokken.
// Leest via de Supabase-functie public.focus_agenda(token); die geeft alleen de blokken terug.
// De publishable key hoort in de browser en mag hier ook staan; beveiliging zit in de geheime link.

const SB_URL = process.env.FOCUS_SB_URL || "https://wmkicxbmutazwiojnyxw.supabase.co";
const SB_KEY = process.env.FOCUS_SB_KEY || "sb_publishable_mV08JMLyMRN1r03R13za0A_MAZLYFt6";

const VTZ = ["BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"];

const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const fold = (line) => {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 73) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
};
const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const okTime = (t) => /^\d{2}:\d{2}$/.test(t);
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (n) => String(Math.floor(n / 60)).padStart(2, "0") + String(n % 60).padStart(2, "0");

export function buildIcs(items = []) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const ev = [];
  for (const i of items) {
    if (!i || !okDate(i.d) || !okTime(i.s)) continue;
    const start = toMin(i.s), end = Math.min(start + (Number(i.m) || 60), 23 * 60 + 59);
    const day = i.d.replace(/-/g, "");
    ev.push("BEGIN:VEVENT", `UID:${String(i.id).replace(/[^\w.-]/g, "")}@focus`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Amsterdam:${day}T${hhmm(start)}00`, `DTEND;TZID=Europe/Amsterdam:${day}T${hhmm(end)}00`,
      `SUMMARY:${esc(i.t || "Focusblok")}`, ...(i.x ? [`DESCRIPTION:${esc(i.x)}`] : []),
      "TRANSP:OPAQUE", "END:VEVENT");
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Focus//NL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Focus", "X-WR-TIMEZONE:Europe/Amsterdam", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...VTZ, ...ev, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}

const text = (status, body) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export default async (req) => {
  const m = new URL(req.url).pathname.match(/^\/agenda\/([A-Za-z0-9_-]{24,64})\.ics$/);
  if (!m) return text(404, "Niet gevonden");
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/rpc/focus_agenda`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: m[1] }),
    });
  } catch {
    return text(502, "Focus is even niet bereikbaar");
  }
  if (!res.ok) return text(502, "Focus is even niet bereikbaar");
  const data = await res.json().catch(() => null);
  if (!data) return text(404, "Deze agenda-link bestaat niet of is ingetrokken");
  return new Response(buildIcs(data.items), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="focus.ics"',
      "Cache-Control": "public, max-age=600",
      "X-Robots-Tag": "noindex",
    },
  });
};

export const config = { path: "/agenda/*" };
