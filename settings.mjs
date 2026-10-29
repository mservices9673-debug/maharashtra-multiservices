import { getStore } from "@netlify/blobs";

const defaultSettings = {
  phone: "8669083431",
  phone2: "9673797263",
  whatsapp: "918669083431",
  hours: "सोम–शनि: सकाळी ९:०० – संध्या ७:०० | रविवार बंद",
  hoursEn: "Mon–Sat: 9:00 AM – 7:00 PM | Sunday Closed",
  upiId: "",
  notice: "",
  rates: {
    pan: "200",
    aadhaar: "150",
    passportPhoto: "50",
    colorXerox: "10",
    shopAct: "300+",
    msme: "200+",
    itr: "500+",
    gst: "400+"
  }
};

export default async (request) => {
  const store = getStore("mms-settings");
  if (request.method === "GET") {
    try {
      const data = (await store.get("settings.json", { type: "json" })) || defaultSettings;
      return new Response(JSON.stringify({ settings: { ...defaultSettings, ...data, rates: { ...defaultSettings.rates, ...(data.rates || {}) } } }), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ settings: defaultSettings }), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
  }
  if (request.method === "POST") {
    const secret = process.env.MMS_ADMIN_TOKEN;
    if (!secret) return new Response(JSON.stringify({ error: "admin_not_configured" }), { status: 503, headers: { "content-type": "application/json" } });
    if (request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
    let body;
    try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const next = {
      phone: String(body.phone || defaultSettings.phone).replace(/\D/g, "").slice(0, 12),
      phone2: String(body.phone2 || defaultSettings.phone2).replace(/\D/g, "").slice(0, 12),
      whatsapp: String(body.whatsapp || defaultSettings.whatsapp).replace(/\D/g, "").slice(0, 15),
      hours: String(body.hours || defaultSettings.hours).slice(0, 120),
      hoursEn: String(body.hoursEn || defaultSettings.hoursEn).slice(0, 120),
      upiId: String(body.upiId || "").slice(0, 80),
      notice: String(body.notice || "").slice(0, 200),
      rates: {
        pan: String(body.rates?.pan ?? defaultSettings.rates.pan).slice(0, 20),
        aadhaar: String(body.rates?.aadhaar ?? defaultSettings.rates.aadhaar).slice(0, 20),
        passportPhoto: String(body.rates?.passportPhoto ?? defaultSettings.rates.passportPhoto).slice(0, 20),
        colorXerox: String(body.rates?.colorXerox ?? defaultSettings.rates.colorXerox).slice(0, 20),
        shopAct: String(body.rates?.shopAct ?? defaultSettings.rates.shopAct).slice(0, 20),
        msme: String(body.rates?.msme ?? defaultSettings.rates.msme).slice(0, 20),
        itr: String(body.rates?.itr ?? defaultSettings.rates.itr).slice(0, 20),
        gst: String(body.rates?.gst ?? defaultSettings.rates.gst).slice(0, 20)
      },
      updatedAt: new Date().toISOString()
    };
    await store.setJSON("settings.json", next);
    return new Response(JSON.stringify({ ok: true, settings: next }), { headers: { "content-type": "application/json" } });
  }
  return new Response("Method not allowed", { status: 405 });
};
