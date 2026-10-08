// 코디에 나오는 옷 종류·색마다 Unsplash(무료 스톡 사진)에서 사진을 찾아 images.json 에 저장해요.
// 사용법:  node tools/fetch_images.mjs          (아직 없는 것만 가져오기)
//          node tools/fetch_images.mjs --refresh (전부 새로 가져오기)
//          node tools/fetch_images.mjs --dry     (검색 없이 대상 목록만 확인)
import fs from "node:fs";

const refresh = process.argv.includes("--refresh");
const dry = process.argv.includes("--dry");

function loadEnv() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!dry && (!KEY || KEY.includes("여기에"))) {
  console.error("❌ .env 파일에 UNSPLASH_ACCESS_KEY 가 필요해요.");
  process.exit(1);
}

// index.html 에서 옷 종류/색 규칙과 코디 데이터를 그대로 가져와요 (앱과 항상 같은 기준)
const html = fs.readFileSync("index.html", "utf8");
const grab = re => eval("(" + html.match(re)[1] + ")");
const OUTFITS = grab(/const OUTFITS = (\[[\s\S]*?\n\]);/);
const KINDS = grab(/const KINDS = (\[[\s\S]*?\n\]);/);
const COLORS = grab(/const COLORS = (\{[\s\S]*?\});/);
const kindOf = n => (KINDS.find(([, re]) => re.test(n)) || ["tee"])[0];
const colorName = n => { let b = "", p = 999; for (const c in COLORS) { const i = n.indexOf(c); if (i >= 0 && i < p) { p = i; b = c; } } return b; };

// 검색어 (영어가 훨씬 잘 나와요)
const KIND_Q = { padding:"puffer coat", coat:"wool coat", jacket:"blazer jacket", dress:"dress", skirt:"midi skirt", pants:"trousers",
  boot:"ankle boots", shoe:"leather loafers", umbrella:"umbrella", turtle:"turtleneck sweater", knit:"knit sweater",
  shirt:"button up shirt", tee:"t-shirt" };
const COLOR_Q = { 화이트:"white", 아이보리:"ivory", 크림:"cream", 베이지:"beige", 카멜:"camel", 브라운:"brown",
  스카이블루:"light blue", 네이비:"navy", 차콜:"charcoal", 그레이:"gray", 블랙:"black" };
const GENDER_Q = { m: "men's", w: "women's" };
const NO_GENDER = new Set(["umbrella"]);

// 대상: (성별, 종류, 색) 조합 + 색 없는 기본형
const targets = new Map();
const add = (g, kind, color) => targets.set([NO_GENDER.has(kind) ? "x" : g, kind, color].join("|"), { g, kind, color });
for (const band of OUTFITS) for (const set of band.sets) for (const g of ["m", "w"])
  for (const name of Object.values(set[g])) if (name) { const k = kindOf(name), c = colorName(name); add(g, k, c); add(g, k, ""); }
for (const g of ["m", "w"]) { add(g, "umbrella", ""); add(g, "boot", ""); }

const out = fs.existsSync("images.json") ? JSON.parse(fs.readFileSync("images.json", "utf8")) : {};
const todo = [...targets.entries()].filter(([k]) => refresh || !out[k]);
console.log(`대상 ${targets.size}개 중 새로 가져올 것 ${todo.length}개 (Unsplash 무료 한도: 시간당 50회 — 넘으면 멈췄다가 다시 실행하면 이어서 받아요)`);
if (dry) { todo.slice(0, 12).forEach(([k, t]) => console.log(" ·", k, "→", queryOf(t))); process.exit(0); }

function queryOf({ g, kind, color }) {
  const sex = NO_GENDER.has(kind) ? "" : GENDER_Q[g] + " ";
  return `${color ? COLOR_Q[color] + " " : ""}${sex}${KIND_Q[kind]} flat lay`;
}

let ok = 0, fail = 0;
for (const [key, t] of todo) {
  try {
    const r = await fetch("https://api.unsplash.com/search/photos?per_page=5&orientation=squarish&content_filter=high&query=" + encodeURIComponent(queryOf(t)),
      { headers: { Authorization: "Client-ID " + KEY, "Accept-Version": "v1" } });
    if (r.status === 429 || (r.status === 403 && /rate/i.test(await r.clone().text()))) { console.log("⏸ 시간당 한도에 도달했어요. 1시간 뒤 같은 명령을 다시 실행하면 이어서 받아요."); break; }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const p = (await r.json()).results?.[0];
    if (p) {
      const utm = "?utm_source=daily_work_outfit&utm_medium=referral";
      out[key] = { img: p.urls.small, link: p.links.html + utm, by: p.user.name, byLink: p.user.links.html + utm, q: queryOf(t) };
      fetch(p.links.download_location, { headers: { Authorization: "Client-ID " + KEY } }).catch(() => {}); // Unsplash 가이드라인: 사용한 사진은 알려주기
      ok++; console.log("✓", key, "-", p.user.name);
    } else { fail++; console.log("– 결과 없음:", key); }
  } catch (e) {
    fail++; console.log("✗", key, e.message);
    if (/HTTP 401/.test(e.message)) { console.error("키가 올바르지 않아요."); break; }
  }
  fs.writeFileSync("images.json", JSON.stringify(out, null, 1));
  await new Promise(r => setTimeout(r, 400));
}
console.log(`완료: 성공 ${ok}, 실패 ${fail}. images.json 에 총 ${Object.keys(out).length}개 저장됨`);
