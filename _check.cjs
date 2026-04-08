const U = "https://expert-salmon-87282.upstash.io";
const T =
  "gQAAAAAAAVTyAAIncDE1Njk0M2QxNWQzOGQ0OTJjOWNmNGVjYTU2Nzk1ODEyYnAxODcyODI";
async function main() {
  const r = await fetch(`${U}/get/gigalertpro:x:latest`, {
    headers: { Authorization: `Bearer ${T}` },
  });
  const data = JSON.parse((await r.json()).result);
  const subs = {};
  data.posts.forEach((p) => {
    subs[p._sub] = (subs[p._sub] || 0) + 1;
  });
  console.log(`Total: ${data.post_count} posts`);
  console.log(`By source:`, JSON.stringify(subs));

  // Check Threads posts specifically
  const threads = data.posts.filter((p) => p._sub === "threads");
  console.log(`\nThreads posts: ${threads.length}`);
  const now = Date.now() / 1000;
  for (const p of threads.slice(0, 10)) {
    const age = now - p.created_utc;
    const days = Math.floor(age / 86400);
    const date = new Date(p.created_utc * 1000).toISOString().slice(0, 10);
    console.log(`  [${date}] (${days}d ago) ${p.title.slice(0, 80)}`);
    console.log(`    → ${p.permalink}`);
  }
}
main();
