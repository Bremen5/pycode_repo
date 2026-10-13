// サイト全体の設定（サイトURL・アナリティクスID・アセットのバージョン）を一元管理する。
// 値を変えたら `node scripts/sync-site.mjs` を実行し、HTML・sitemap.xml・robots.txt に反映すること。

export const SITE = Object.freeze({
  name: 'お金の計算ツール箱',
  // 本番のサイトURL（末尾スラッシュなし）。Netlify でサイト名を決めたら差し替える。
  url: 'https://<サイト名>.netlify.app',
  // Googleアナリティクス4 の測定ID。プレースホルダーのままなら計測タグは読み込まない。
  gaId: 'G-XXXXXXXXXX',
  // CSS・JS のキャッシュ更新用バージョン（?v=...）。`node scripts/sync-site.mjs --bump` で更新する。
  assetVersion: '202610130001',
});

const GA_PLACEHOLDER = 'G-XXXXXXXXXX';

/** GA4 の計測タグを読み込む（IDが未設定・プレースホルダーの場合は何もしない） */
export function initAnalytics(gaId = SITE.gaId) {
  if (typeof document === 'undefined') return false;
  if (!/^G-[A-Z0-9]+$/.test(gaId) || gaId === GA_PLACEHOLDER) return false;
  if (window.gtag) return true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', gaId, { anonymize_ip: true });
  return true;
}

/** フッターの年表示など、全ページ共通の小さな処理 */
function initCommon() {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll('[data-year]')) el.textContent = String(new Date().getFullYear());
}

initAnalytics();
initCommon();
