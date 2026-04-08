// Lightweight Threads fetcher (best-effort HTML parse)
// NOTE: Threads has no stable public RSS/API. This endpoint performs
// a best-effort HTML scrape of a provided Threads URL and returns
// minimal structured fields (title, description, author, posted_at).
// This is fragile and may break if Threads changes their site.

function metaContent(html, prop) {
  const rx = new RegExp(`<meta[^>]+(?:property|name)=(?:"|')${prop}(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')`, "i");
  const m = html.match(rx);
  return m ? m[1] : null;
}

function findTimeISO(html) {
  const rx = /<time[^>]*datetime="([^"]+)"/i;
  const m = html.match(rx);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = req.query.url || req.url.split("?url=")[1];
  if (!url) {
    return res.status(400).json({ error: "Provide ?url=<threads_url>" });
  }

  try {
    const resp = await fetch(url, { headers: { "User-Agent": "GigAlertPro/1.0" } });
    if (!resp.ok) return res.status(502).json({ error: `Fetch failed: ${resp.status}` });
    const html = await resp.text();

    // Try OpenGraph meta tags first
    const title = metaContent(html, "og:title") || metaContent(html, "twitter:title") || null;
    const description = metaContent(html, "og:description") || metaContent(html, "twitter:description") || null;
    const author = metaContent(html, "og:site_name") || metaContent(html, "twitter:site") || null;
    const posted_at = findTimeISO(html) || null;

    const post = {
      id: url,
      url,
      title: title || "",
      body_preview: description || "",
      author: author || null,
      posted_at,
      source_platform: "Threads",
    };

    return res.status(200).json({ posts: [post], post_count: 1, feed: "threads-scrape" });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
