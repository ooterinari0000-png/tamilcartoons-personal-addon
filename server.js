const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 10000;
const SITE = "https://tamilcartoons.in";
const ID = "in.tamilcartoons.personal";
const CACHE_MS = 10 * 60 * 1000;
const cache = { at: 0, items: [], details: new Map() };

app.get("/", (_req, res) => res.type("text").send(
  "TamilCartoons personal add-on is running. Manifest: /manifest.json"
));

app.get("/manifest.json", (_req, res) => res.json({
  id: ID,
  version: "1.1.0",
  name: "TamilCartoons Personal Catalogue",
  description: "Browse TamilCartoons catalogue, search titles, view page details and episode links.",
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

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function safeUrl(href, base = SITE) {
  try {
    const u = new URL(href, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch { return ""; }
}
function makeId(url) {
  return "tc-" + Buffer.from(url).toString("base64url").replace(/=+$/g, "").slice(0, 100);
}
async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; PersonalCatalogueAddon/1.1)" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Source returned HTTP " + response.status);
  return await response.text();
}
async function getCatalogue(force = false) {
  if (!force && Date.now() - cache.at < CACHE_MS && cache.items.length) return cache.items;
  const html = await fetchHtml(SITE);
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $("article, .post, .type-post, .entry, .post-item, .item").each((_i, card) => {
    const c = $(card);
    const a = c.find("h1 a, h2 a, h3 a, .entry-title a, .post-title a, a[href]").filter((_j, el) => {
      const href = safeUrl($(el).attr("href"));
      const title = clean($(el).text() || $(el).attr("title"));
      return href.startsWith(SITE) && title.length >= 4 && href !== SITE + "/";
    }).first();
    const href = safeUrl(a.attr("href"));
    const title = clean(a.text() || a.attr("title"));
    if (!href || !title || seen.has(href)) return;
    if (/^(home|watch and download|read more|view all|next|previous)$/i.test(title)) return;
    seen.add(href);
    const img = c.find("img").first();
    const poster = safeUrl(img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "");
    items.push({
      id: makeId(href), type: /movie/i.test(title) ? "movie" : "series",
      name: title, poster: poster || undefined,
      description: "Catalogue entry from TamilCartoons.in",
      _url: href
    });
  });

  // Fallback for themes without article cards.
  if (!items.length) {
    $("a[href]").each((_i, el) => {
      const a = $(el), href = safeUrl(a.attr("href")), title = clean(a.text());
      if (!href || !href.startsWith(SITE) || href === SITE + "/" || title.length < 8) return;
      if (/^(home|watch and download|read more|view all|next|previous)$/i.test(title)) return;
      if (seen.has(href) || /\/(category|tag|author)\//i.test(href)) return;
      seen.add(href);
      const img = a.find("img").first();
      const poster = safeUrl(img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "");
      items.push({
        id: makeId(href), type: /movie/i.test(title) ? "movie" : "series",
        name: title, poster: poster || undefined,
        description: "Catalogue entry from TamilCartoons.in",
        _url: href
      });
    });
  }

  cache.at = Date.now();
  cache.items = items.slice(0, 200);
  return cache.items;
}

async function getDetails(item) {
  if (cache.details.has(item.id)) return cache.details.get(item.id);
  const html = await fetchHtml(item._url);
  const $ = cheerio.load(html);
  const article = $("article").first().length ? $("article").first() :
    ($(".entry-content").first().length ? $(".entry-content").first() : $("body"));
  const description = clean(article.find("p").map((_i, el) => $(el).text()).get().join(" ")).slice(0, 2500);
  const links = [];
  const seen = new Set();
  article.find("a[href]").each((_i, el) => {
    const a = $(el);
    const url = safeUrl(a.attr("href"), item._url);
    const title = clean(a.text() || a.attr("title"));
    if (!url || !title || seen.has(url) || url === item._url) return;
    seen.add(url);
    // Keep links as links to the original pages/providers; do not extract protected player streams.
    if (/episode|part\s*\d+|watch|stream|official|video|season|download/i.test(title)) {
      links.push({ title: title.slice(0, 180), url });
    }
  });
  const detail = { description: description || item.description, links: links.slice(0, 100) };
  cache.details.set(item.id, detail);
  return detail;
}

app.get("/catalog/:type/:id.json", async (req, res) => {
  try {
    const search = clean(req.query.search).toLowerCase();
    let items = await getCatalogue();
    if (search) items = items.filter(x => x.name.toLowerCase().includes(search));
    const metas = items
      .filter(x => req.params.type === "movie" ? x.type === "movie" : x.type === "series")
      .map(({ _url, ...x }) => x);
    res.json({ metas });
  } catch (err) {
    console.error("catalog error:", err.message);
    res.status(502).json({ metas: [] });
  }
});

app.get("/meta/:type/:id.json", async (req, res) => {
  try {
    const item = (await getCatalogue()).find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ meta: null });
    const detail = await getDetails(item);
    const { _url, ...meta } = item;
    meta.description = detail.description;
    meta.links = [{ name: "Open original TamilCartoons page", category: "official", url: item._url }];
    // Represent discovered episode/watch-page links as navigable links, not fake playable videos.
    meta.behaviorHints = { defaultVideoId: undefined };
    res.json({ meta });
  } catch (err) {
    console.error("meta error:", err.message);
    res.status(502).json({ meta: null });
  }
});

app.get("/stream/:type/:id.json", async (req, res) => {
  try {
    const item = (await getCatalogue()).find(x => x.id === req.params.id);
    if (!item) return res.json({ streams: [] });
    // Only return the source's page link. No stream extraction, DRM bypass, or proxying.
    res.json({ streams: [{
      name: "TamilCartoons website",
      title: "Open original page (external)",
      externalUrl: item._url
    }] });
  } catch (err) {
    console.error("stream error:", err.message);
    res.status(502).json({ streams: [] });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Add-on listening on port ${PORT}`));
  
