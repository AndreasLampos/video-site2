// Copies the starter clips in seed/media into the R2 bucket.
// Usage: node scripts/seed-media.mjs --local | --remote
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const flag = process.argv[2];
if (flag !== "--local" && flag !== "--remote") {
  console.error("Usage: node scripts/seed-media.mjs --local | --remote");
  process.exit(1);
}

for (const name of readdirSync("seed/media")) {
  const type = name.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const args = ["wrangler", "r2", "object", "put", `video-site-media/${name}`, "--file", `seed/media/${name}`, "--content-type", type, flag];
  const r = spawnSync("npx", args, { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(`Failed on ${name}`); process.exit(1); }
  console.log(`Uploaded ${name}`);
}
