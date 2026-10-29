import { getStore } from "@netlify/blobs";
import { URL } from "node:url";

// ONLY the two user-requested sources are allowed. These are third-party job-information portals,
// not government domains. Every card links back to the source page for verification.
const ALLOWED_HOSTS = new Set(["majhinaukri.in", "www.majhinaukri.in", "nmk.co.in", "www.nmk.co.in"]);
const DEFAULT_SOURCES = [
  "https://majhinaukri.in/",
  "https://nmk.co.in/recruitment/",
  "https://nmk.co.in/mahajobs/"
];

export default async () => {
  const store = getStore("mms-recruitment");
  const active = await store.get("active.json", { type: "json" }) || [];
  const archive = await store.get("archive.json", { type: "json" }) || [];
  const now = new Date();
  const stillActive = [];
  for (const item of active) {
    if (item.lastDate && new Date(item.lastDate + "T23:59:59+05:30") < now) archive.unshift({ ...item, status: "expired", archivedAt: now.toISOString() });
    else stillActive.push(item);
  }

  let configured;
  try { configured = JSON.parse(process.env.RECRUITMENT_SOURCES || "null"); } catch { configured = null; }
  const sources = Array.isArray(configured) ? configured : DEFAULT_SOURCES;
  const added = [], errors = [];
  for (const source of sources.slice(0, 10)) {
    try {
      const url = new URL(typeof source === "string" ? source : source.url);
      if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Only Majhi Naukri and NMK source domains are allowed");
      const response = await fetch(url, { headers: { "user-agent": "MMSRecruitmentMonitor/1.0 (source-attributed reader)", "accept": "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`${url.hostname} HTTP ${response.status}`);
      const html = await response.text(); if (html.length > 3_000_000) throw new Error("Source page too large");
      const sourceItems = extractItems(html, url);
      for (const item of sourceItems) {
        const id = canonical(item.url);
        if (!id || stillActive.some(x => canonical(x.url) === id) || added.some(x => canonical(x.url) === id)) continue;
        const combinedText = `${item.title} ${item.description}`;
        if (!/(recruit|recruitment|vacanc|career|bharti|भरती|नियुक्ति|भर्ती|notification|advertisement|योजना|scheme|scholarship|शिष्यवृत्ती|शिष्यवृत्ति|योजने|अर्ज)/i.test(combinedText)) continue;
        const isScheme = /(योजना|scheme|scholarship|शिष्यवृत्ती|शिष्यवृत्ति|benefit)/i.test(combinedText);
        added.push({
          id, title: item.title.slice(0, 180), description: item.description.slice(0, 900),
          category: isScheme ? "सरकारी योजना / Scheme" : "भरती / Recruitment",
          url: id, lastDate: "", source: url.hostname.replace(/^www\./, ""),
          sourceLabel: url.hostname.includes("nmk") ? "NMK" : "Majhi Naukri",
          publishedAt: new Date().toISOString(), status: "active", needsDateReview: true,
          verificationNote: "मूळ माहिती स्रोताच्या पेजवर तपासा. अंतिम तारीख उपलब्ध/विश्वसनीयरीत्या वाचता आली नाही तर ती अंदाजाने दाखवली जाणार नाही."
        });
      }
    } catch (e) { errors.push(String(e.message || e)); }
  }
  const combined = [...added, ...stillActive].slice(0, 2000);
  await store.setJSON("active.json", combined);
  await store.setJSON("archive.json", archive.slice(0, 5000));
  console.log(JSON.stringify({ sources: sources.length, added: added.length, expired: archive.length, errors: errors.slice(0, 10) }));
  return new Response(JSON.stringify({ ok: true, sources: sources.length, added: added.length, expired: archive.length, errors: errors.length }));
};
export const config = { schedule: "0 5,11,17,23 * * *" };

function extractItems(html, base) {
  // First use RSS/Atom items if the configured page happens to serve a feed.
  const feedBlocks = [...html.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => m[2]);
  const out = [];
  for (const b of feedBlocks) {
    const title = clean(tag(b, "title"));
    const rawLink = clean(tag(b, "link")) || (b.match(/<link\b[^>]*href=["']([^"']+)["']/i) || [])[1];
    const link = resolveLink(rawLink, base);
    const description = clean(tag(b, "description") || tag(b, "summary") || tag(b, "content"));
    if (title && link) out.push({ title, url: link, description });
  }
  if (out.length) return out;
  // For HTML pages, collect linked article headings and nearby short text. No dates are guessed.
  const seen = new Set();
  for (const m of html.matchAll(/<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = m[2]; const inner = m[3];
    const title = clean(inner);
    const link = resolveLink(href, base);
    if (!title || title.length < 12 || title.length > 220 || !link || seen.has(link)) continue;
    if (!/(recruit|vacanc|bharti|भरती|भर्ती|जागा|पदभरती|नोकरी|योजना|scheme|scholarship|शिष्यवृत्ती|शिष्यवृत्ति|अर्ज|advertisement|जाहिरात)/i.test(title + " " + href)) continue;
    seen.add(link);
    out.push({ title, url: link, description: "स्रोतावरील मूळ जाहिरात उघडून संपूर्ण तपशील आणि अंतिम तारीख तपासा." });
    if (out.length >= 100) break;
  }
  return out;
}
function resolveLink(raw, base) {
  try { const u = new URL(String(raw || ""), base); if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return ""; u.hash = ""; return u.toString(); } catch { return ""; }
}
function canonical(s) { try { const u = new URL(s); u.hash = ""; u.search = ""; return u.toString().replace(/\/$/, ""); } catch { return ""; } }
function tag(s, name) { const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"); return (s.match(re)||[])[1] || ""; }
function clean(s) { return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#8217;|&rsquo;/g,"’").replace(/&#8211;|&ndash;/g,"–").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim(); }
