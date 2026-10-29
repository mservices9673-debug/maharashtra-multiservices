import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("mms-recruitment");
    const active = await store.get("active.json", { type: "json" }) || [];
    const now = new Date();
    const valid = active.filter(x => !x.lastDate || new Date(x.lastDate + "T23:59:59+05:30") >= now);
    return new Response(JSON.stringify({ updates: valid, generatedAt: now.toISOString() }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" }
    });
  } catch (e) {
    console.error("Updates read failed", e);
    return new Response(JSON.stringify({ updates: [], error: "updates_unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
  }
};
