// 날씨 구간별 "분위기 사진"을 Unsplash에서 찾아 moods.json 에 저장해요.
//   node tools/fetch_mood.mjs search          → 구간마다 후보 4장을 tools/mood_candidates.json 에 저장
//   node tools/fetch_mood.mjs pick 28=0 23=2 … → 고른 번호의 사진을 moods.json 에 저장
import fs from "node:fs";

for (const line of fs.existsSync(".env") ? fs.readFileSync(".env", "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY || KEY.includes("여기에")) { console.error("❌ .env 에 UNSPLASH_ACCESS_KEY 가 필요해요."); process.exit(1); }
const H = { Authorization: "Client-ID " + KEY, "Accept-Version": "v1" };

// 구간 이름(= 앱의 min 값) → 검색어. rain 은 비 오는 날 전용
const QUERIES = {
  "28": "summer linen shirt outfit flat lay", "23": "light shirt chinos outfit flat lay", "20": "cardigan shirt outfit flat lay",
  "17": "blazer knit sweater outfit flat lay", "12": "trench coat autumn outfit", "9": "wool coat autumn outfit flat lay",
  "5": "winter coat scarf outfit", "-99": "winter puffer jacket snow outfit", "rain": "rainy day umbrella city street",
};
const CAND = "tools/mood_candidates.json";
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "search") {
  const out = {};
  for (const [band, q] of Object.entries(QUERIES)) {
    const r = await fetch("https://api.unsplash.com/search/photos?per_page=4&orientation=landscape&content_filter=high&query=" + encodeURIComponent(q), { headers: H });
    if (!r.ok) { console.error("✗", band, "HTTP", r.status, "— 한도일 수 있어요. 잠시 뒤 다시 실행해 주세요."); break; }
    out[band] = (await r.json()).results.map(p => ({ id: p.id, img: p.urls.regular, by: p.user.name, byLink: p.user.links.html, link: p.links.html, dl: p.links.download_location }));
    console.log("✓", band, out[band].length + "장");
    await new Promise(r => setTimeout(r, 300));
  }
  fs.writeFileSync(CAND, JSON.stringify(out, null, 1));
} else if (cmd === "pick") {
  const cand = JSON.parse(fs.readFileSync(CAND, "utf8"));
  const moods = fs.existsSync("moods.json") ? JSON.parse(fs.readFileSync("moods.json", "utf8")) : {};
  const utm = "?utm_source=daily_work_outfit&utm_medium=referral";
  for (const a of rest) {
    const [band, i] = a.split("="); const p = cand[band]?.[Number(i)];
    if (!p) { console.error("없는 선택:", a); continue; }
    moods[band] = { img: p.img, by: p.by, byLink: p.byLink + utm, link: p.link + utm };
    await fetch(p.dl, { headers: H }).catch(() => {}); // Unsplash 가이드라인: 사용한 사진 알리기
    console.log("✓ 저장", band, "-", p.by);
  }
  fs.writeFileSync("moods.json", JSON.stringify(moods, null, 1));
} else console.log("사용법: search | pick 28=0 23=1 …");
