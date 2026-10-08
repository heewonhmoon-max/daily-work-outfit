// 코디에 나오는 모든 옷 이름으로 네이버 쇼핑을 검색해서, 상품 사진 주소를 images.json 에 저장해요.
// 사용법:  node tools/fetch_images.mjs          (아직 없는 것만 가져오기)
//          node tools/fetch_images.mjs --refresh (전부 새로 가져오기)
//          node tools/fetch_images.mjs --dry     (검색 없이 대상 목록만 확인)
import fs from "node:fs";

const refresh = process.argv.includes("--refresh");
const dry = process.argv.includes("--dry");

// .env 에서 키 읽기 (이 파일은 GitHub에 올라가지 않아요)
function loadEnv() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
if (!dry && (!ID || !SECRET)) {
  console.error("❌ .env 파일에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 이 필요해요.");
  process.exit(1);
}

// index.html 안의 코디 데이터에서 (성별, 이름) 목록 뽑기
const html = fs.readFileSync("index.html", "utf8");
const OUTFITS = eval("(" + html.match(/const OUTFITS = (\[[\s\S]*?\n\]);/)[1] + ")");
const targets = new Map();
for (const band of OUTFITS) for (const set of band.sets) for (const g of ["m", "w"])
  for (const name of Object.values(set[g])) if (name) targets.set(g + "|" + name, { g, name });
for (const g of ["m", "w"]) for (const name of ["방수 로퍼 / 레인 부츠", "장우산"]) targets.set(g + "|" + name, { g, name });

const out = fs.existsSync("images.json") ? JSON.parse(fs.readFileSync("images.json", "utf8")) : {};
const todo = [...targets.entries()].filter(([k]) => refresh || !out[k]);
console.log(`대상 ${targets.size}개 중 새로 가져올 것 ${todo.length}개`);
if (dry) { todo.slice(0, 10).forEach(([k]) => console.log(" ·", k)); process.exit(0); }

const strip = s => s.replace(/<[^>]+>/g, "");
let ok = 0, fail = 0;
for (const [key, { g, name }] of todo) {
  const query = (g === "m" ? "남성 " : "여성 ") + name.replace(/\s*\+\s*/g, " ").replace(/\s*\/\s*/g, " ");
  try {
    const r = await fetch("https://openapi.naver.com/v1/search/shop.json?display=5&sort=sim&query=" + encodeURIComponent(query),
      { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 120));
    const item = (await r.json()).items?.find(i => i.image);
    if (item) { out[key] = { img: item.image, link: item.link, title: strip(item.title), mall: item.mallName }; ok++; console.log("✓", key); }
    else { fail++; console.log("– 결과 없음:", key); }
  } catch (e) {
    fail++; console.log("✗", key, e.message);
    if (/HTTP 401|HTTP 403/.test(e.message)) { console.error("키가 올바르지 않거나 '검색' API 권한이 없어요."); break; }
  }
  fs.writeFileSync("images.json", JSON.stringify(out, null, 1));
  await new Promise(r => setTimeout(r, 120)); // 너무 빠르게 요청하지 않기
}
console.log(`완료: 성공 ${ok}, 실패 ${fail}. images.json 에 총 ${Object.keys(out).length}개 저장됨`);
