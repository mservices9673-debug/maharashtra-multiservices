import { getStore } from "@netlify/blobs";

const allowedCategories = new Set(["भरती / Recruitment", "शासकीय योजना / Government Scheme", "सेवा सूचना / Service Notice"]);
export default async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = process.env.MMS_ADMIN_TOKEN;
  if (!secret) return new Response(JSON.stringify({ error: "admin_not_configured" }), { status: 503, headers: { "content-type": "application/json" } });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  let item; try { item = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!item || typeof item.title !== "string" || typeof item.description !== "string" || !item.title.trim() || !item.description.trim()) return new Response("Title and description required", { status: 400 });
  if (item.url && (!/^https:\/\//i.test(item.url) || !isPublicHttpsUrl(item.url))) return new Response("Only public HTTPS links are allowed", { status: 400 });
  if (item.lastDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.lastDate)) return new Response("Invalid lastDate; use YYYY-MM-DD", { status: 400 });
  const normalized = {
    id: String(item.id || item.url || `${item.title}-${item.lastDate || ""}`).slice(0, 300),
    title: item.title.trim().slice(0, 160), description: item.description.trim().slice(0, 800),
    category: allowedCategories.has(item.category) ? item.category : "भरती / Recruitment",
    url: item.url || "", lastDate: item.lastDate || "", source: item.source || "Admin",
    publishedAt: item.publishedAt || new Date().toISOString(), status: "active"
  };
  const store = getStore("mms-recruitment");
  const active = await store.get("active.json", { type: "json" }) || [];
  const archive = await store.get("archive.json", { type: "json" }) || [];
  const existing = active.findIndex(x => x.id === normalized.id || (normalized.url && x.url === normalized.url));
  if (existing >= 0) active[existing] = { ...active[existing], ...normalized }; else active.unshift(normalized);
  const now = new Date();
  const remaining = [];
  for (const x of active) {
    if (x.lastDate && new Date(x.lastDate + "T23:59:59+05:30") < now) archive.unshift({ ...x, status: "expired", archivedAt: now.toISOString() });
    else remaining.push(x);
  }
  await store.setJSON("active.json", remaining.slice(0, 2000));
  await store.setJSON("archive.json", archive.slice(0, 5000));
  return new Response(JSON.stringify({ ok: true, count: remaining.length }), { headers: { "content-type": "application/json" } });
};
function isPublicHttpsUrl(value) { try { const u = new URL(value); return u.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(u.hostname) && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname); } catch { return false; } }
