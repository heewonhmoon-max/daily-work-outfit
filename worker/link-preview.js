// Cloudflare Worker: 쇼핑몰 상품 링크를 받아서 상품명·대표 이미지·카테고리를 알려주는 작은 서버예요.
// 카카오톡 링크 미리보기와 같은 방식으로, 페이지가 공개하는 og: 정보만 읽어요. 이미지는 저장하지 않아요.
//
// 사용: GET https://<내-워커-주소>/?url=https://www.musinsa.com/products/12345

// 허용하는 쇼핑몰 (아무 주소나 읽어주는 서버가 되지 않도록 제한해요)
const ALLOWED_HOSTS = ["musinsa.com", "29cm.co.kr"];
// 이 앱이 있는 웹주소에서만 호출 가능
const ALLOWED_ORIGINS = ["https://heewonhmoon-max.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];

const hostAllowed = h => ALLOWED_HOSTS.some(d => h === d || h.endsWith("." + d));
const decode = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

function meta(html, prop) {
  // <meta property="og:title" content="..."> 또는 content 가 앞에 오는 경우 둘 다 처리
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
  return decode((a || b || [, ""])[1]).trim();
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Vary": "Origin",
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET" } });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: "허용되지 않은 호출이에요" }, 403);

    let target;
    try { target = new URL(new URL(request.url).searchParams.get("url")); } catch { return json({ error: "주소가 올바르지 않아요" }, 400); }
    if (target.protocol !== "https:" || !hostAllowed(target.hostname)) return json({ error: "지원하지 않는 쇼핑몰이에요 (무신사, 29CM만 가능)" }, 400);

    try {
      const res = await fetch(target.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OutfitLinkPreview/1.0)", "Accept-Language": "ko-KR,ko;q=0.9" },
        redirect: "follow", signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return json({ error: "페이지를 열 수 없어요 (" + res.status + ")" }, 502);
      if (!hostAllowed(new URL(res.url).hostname)) return json({ error: "다른 사이트로 이동돼서 읽지 않았어요" }, 400);
      const html = (await res.text()).slice(0, 400000); // <head> 안의 정보만 필요해서 앞부분만

      const title = meta(html, "og:title"), image = meta(html, "og:image"), desc = meta(html, "og:description");
      const category = (desc.match(/제품분류\s*:\s*([^브]*?)(?:\s*브랜드|$)/) || [, ""])[1].trim();
      const brand = (desc.match(/브랜드\s*:\s*(.+?)(?:\s*제품번호|$)/) || [, ""])[1].trim();
      if (!title) return json({ error: "상품 정보를 찾지 못했어요. 상품 페이지 링크가 맞는지 확인해 주세요" }, 404);
      return json({
        title: title.replace(/\s*[-|]\s*(후기\s*\|\s*)?무신사.*$/, "").trim(),
        image: image.startsWith("https://") && !/og_musinsa|\/og\//.test(image) ? image : "",
        category, brand, url: target.toString(),
      });
    } catch (e) {
      return json({ error: "불러오는 중 문제가 생겼어요" }, 502);
    }
  },
};
