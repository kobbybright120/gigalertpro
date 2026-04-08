#!/usr/bin/env node
// Quick Threads.net smoke-test — fetch a few tags and print discovered posts
// Run: node scripts/test-threads.js [tag1 tag2 ...]

(async function main() {
  const args = process.argv.slice(2);
  const TAGS = args.length ? args : ["hiring", "freelance", "remotejobs"];
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

  if (typeof fetch === "undefined") {
    console.error(
      "Global fetch is not available in this Node.js. Run on Node 18+ or install node-fetch and adapt the script.",
    );
    process.exit(1);
  }

  function extractEmbeddedPosts(html) {
    const out = [];
    const seen = new Set();
    const re1 =
      /"code"\s*:\s*"([^"\\]+)"[\s\S]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re1.exec(html)) !== null) {
      const code = m[1];
      let text = m[2]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      text = text.trim();
      if (text.length > 15 && !seen.has(code)) {
        seen.add(code);
        out.push({ code, text });
      }
    }

    const re2 =
      /"text"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"code"\s*:\s*"([^"\\]+)"/g;
    while ((m = re2.exec(html)) !== null) {
      let text = m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      const code = m[2];
      text = text.trim();
      if (text.length > 15 && !seen.has(code)) {
        seen.add(code);
        out.push({ code, text });
      }
    }

    return out;
  }

  function extractLinks(html) {
    const posts = [];
    const seen = new Set();
    const rx = /@([A-Za-z0-9_.]+)\/post\/([A-Za-z0-9_-]+)/g;
    let m;
    while ((m = rx.exec(html)) !== null) {
      const user = m[1];
      const code = m[2];
      const key = `${user}/${code}`;
      if (!seen.has(key)) {
        seen.add(key);
        posts.push({ user, code });
      }
    }
    return posts;
  }

  function metaContent(html, prop) {
    const rx = new RegExp(
      `<meta[^>]+(?:property|name)=(?:"|')${prop}(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')`,
      "i",
    );
    const m = html.match(rx);
    if (m) return m[1];
    const rx2 = new RegExp(
      `<meta[^>]+content=(?:"|')([^"']+)(?:"')[^>]+(?:property|name)=(?:"|')${prop}(?:"|')`,
      "i",
    );
    const m2 = html.match(rx2);
    return m2 ? m2[1] : null;
  }

  async function fetchSearchTag(tag) {
    const url = `https://www.threads.net/search?q=%23${encodeURIComponent(
      tag,
    )}&serp_type=default`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "follow",
      });
      if (!resp.ok) {
        return { tag, error: `HTTP ${resp.status}` };
      }
      const html = await resp.text();

      // Try embedded JSON first
      const embedded = extractEmbeddedPosts(html);
      if (embedded.length > 0) {
        return {
          tag,
          posts: embedded.slice(0, 5).map((p) => ({
            id: `threads_${p.code}`,
            code: p.code,
            text: p.text,
            permalink: `https://www.threads.net/post/${p.code}`,
          })),
        };
      }

      // Fallback: extract links and fetch detail pages (limit 3)
      const links = extractLinks(html).slice(0, 3);
      const posts = [];
      for (const l of links) {
        const postUrl = `https://www.threads.net/@${l.user}/post/${l.code}`;
        try {
          const pr = await fetch(postUrl, {
            headers: { "User-Agent": UA, Accept: "text/html" },
            redirect: "follow",
          });
          if (!pr.ok) continue;
          const ph = await pr.text();
          const desc =
            metaContent(ph, "og:description") ||
            metaContent(ph, "twitter:description") ||
            "";
          const text = desc
            .replace(/^\d+\s*(likes?|replies|reposts?),?\s*/gi, "")
            .replace(/^@\w+\s*:\s*/i, "")
            .trim();
          if (text.length < 8) continue;
          posts.push({
            id: `threads_${l.code}`,
            code: l.code,
            text: text.slice(0, 2000),
            permalink: postUrl,
          });
        } catch (err) {
          continue;
        }
      }

      return { tag, posts };
    } catch (err) {
      return { tag, error: String(err) };
    }
  }

  for (const tag of TAGS) {
    process.stdout.write(`\n[TEST] Searching Threads tag #${tag}... `);
    const res = await fetchSearchTag(tag);
    if (res.error) {
      console.log(`failed: ${res.error}`);
      continue;
    }
    const posts = res.posts || res.posts || [];
    console.log(`found ${posts.length} posts`);
    for (const p of posts.slice(0, 5)) {
      console.log(`- ${p.id} ${p.permalink}`);
      console.log(`  ${p.text.slice(0, 200).replace(/\n/g, " ")}...\n`);
    }
  }

  console.log("\n[TEST] Done.");
})();
