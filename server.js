const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 10000;
const SITE = "https://tamilcartoons.in";
const ID = "in.tamilcartoons.personal";
const cache = { at: 0, items: [] };
const CACHE_MS = 10 * 60 * 1000;

app.set("trust proxy", 1);

app.get("/", (_req, res) => res.type("text").send(
  "TamilCartoons personal catalogue add-on is running. Manifest: /manifest.json"
));

app.get("/manifest.json", (_req, res) => res.json({
  id: ID,
  version: "1.0.0",
  name: "TamilCartoons Personal Catalogue",
  description: "Browse catalogue entries and open the original TamilCartoons.in pages. Does not extract or proxy video streams.",
  logo: SITE + "/favicon.ico",
  resources: ["catalog", "meta", "stream"],
  types: ["series", "movie"],
  catalogs: [{
    type: "series",
    id: "tamilcartoons-latest",
    name: "TamilCartoons Latest",
    extra: [{ name: "search", isRequired: false }]
  }]
}));

async function getItems() {
  if (Date.now() - cache.at < CACHE_MS && cache.items.length) return cache.items;
  const response = await fetch(SITE, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; PersonalCatalogueAddon/1.0)" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("Source site returned HTTP " + response.status);
  const html = await response.text();
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $("a[href]").each((_i, el) => {
    const a = $(el);
    const href = new URL(a.attr("href"), SITE).href;
    const title = a.text().replace(/\s+/g, " ").trim();
    if (!href.startsWith(SITE) || href === SITE + "/" || !title || title.length < 4) return;
    if (/^(home|view all|menu|search|anime in tamil|tamil|tamil dubbed|tamil dubbed anime|explore latest|0-9|[a-z])$/i.test(title)) return;
    if (href.includes("#") || /\/(category|tag|author)\//i.test(href)) return;
    if (!/\/\d{4}\/\d{2}\//.test(href) && !/\/[^/]+\/?$/.test(href)) return;
    if (seen.has(href)) return;
    seen.add(href);

    const img = a.find("img").first();
    let poster = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
    if (poster) {
      try { poster = new URL(poster, SITE).href; } catch { poster = ""; }
    }
    const id = "tc-" + Buffer.from(href).toString("base64url").replace(/=+$/g, "").slice(0, 80);
    items.push({
      id, type: "series", name: title, poster: poster || undefined,
      description: "Catalogue entry from TamilCartoons.in",
      _url: href
    });
  });

  cache.at = Date.now();
  cache.items = items.slice(0, 100);
  return cache.items;
}

app.get("/catalog/:type/:id.json", async (req, res) => {
  try {
    const search = String(req.query.search || "").toLowerCase().trim();
    let items = await getItems();
    if (search) items = items.filter(x => x.name.toLowerCase().includes(search));
    res.json({ metas: items.map(({ _url, ...x }) => x) });
  } catch (e) {
    res.status(502).json({ metas: [], error: "Could not read the source catalogue right now." });
  }
});

app.get("/meta/:type/:id.json", async (req, res) => {
  try {
    const item = (await getItems()).find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ meta: null });
    const { _url, ...meta } = item;
    meta.links = [{ name: "Open original page", category: "official", url: _url }];
    res.json({ meta });
  } catch {
    res.status(502).json({ meta: null });
  }
});

// Opens the original source page instead of extracting, proxying, or bypassing video streams.
app.get("/stream/:type/:id.json", async (req, res) => {
  try {
    const item = (await getItems()).find(x => x.id === req.params.id);
    if (!item) return res.json({ streams: [] });
    res.json({ streams: [{ title: "Open on TamilCartoons.in", externalUrl: item._url }] });
  } catch {
    res.status(502).json({ streams: [] });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Add-on listening on port ${PORT}`));
