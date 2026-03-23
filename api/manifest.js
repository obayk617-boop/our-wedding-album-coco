/**
 * Vercel Edge Function: /api/manifest?seat=N
 *
 * ?seat=N を受け取り、start_url に席番号クエリを埋め込んだ
 * manifest JSON を返す。
 * iOS / Android PWA どちらでもホーム画面追加後の起動時に
 * ?seat=N 付きの URL で開くため、ストレージ非共有問題を回避できる。
 */
export const config = { runtime: "edge" };

export default function handler(req) {
  const url = new URL(req.url);
  const seat = url.searchParams.get("seat") || "100";

  // ベースURL（オリジン + "/"）
  const base = `${url.origin}/`;

  const manifest = {
    name: "Wedding Album",
    short_name: "Wedding",
    description: "結婚式の思い出をみんなでシェア",
    // ここに席番号を埋め込むことで PWA 起動時も ?seat=N が付く
    start_url: `${base}?seat=${seat}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#b3ecf8",
    theme_color: "#29b6d8",
    lang: "ja",
    icons: [
      {
        src: "icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      // ブラウザにキャッシュさせない（席番号が変わる可能性があるため）
      "Cache-Control": "no-store",
    },
  });
}
