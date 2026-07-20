/**
 * Rent.li 이용 데이터 수집.
 * - Vercel Analytics: index/help.html의 /_vercel/insights/script.js 스크립트가 담당
 *   (Vercel 대시보드에서 Analytics를 Enable해야 동작. 로컬에선 404 — 무해)
 * - PostHog: 아래 키가 비어 있으면 전부 no-op. 프로젝트 생성 후 키만 넣으면 활성화.
 *   (PostHog 프로젝트 키는 공개 전제로 설계됨 — 서버 키류와 다름)
 */
const POSTHOG_KEY = 'phc_oi4iaoacRJMFhEUoqrUAfBtE8j8nT5M4K8gLHq3A4yVg';
const POSTHOG_HOST = 'https://us.i.posthog.com';

let phReady = false;

(function initPostHog() {
  if (!POSTHOG_KEY) return;
  // 공식 스니펫과 동일한 CDN 로드
  const s = document.createElement('script');
  s.src = `${POSTHOG_HOST.replace('.i.', '-assets.i.')}/static/array.js`;
  s.async = true;
  s.onload = () => {
    window.posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, capture_pageview: true });
    phReady = true;
  };
  document.head.appendChild(s);
})();

/** 이벤트 기록. PostHog 미설정/로드 전이면 조용히 무시. */
function track(event, props = {}) {
  try {
    if (phReady && window.posthog) window.posthog.capture(event, props);
  } catch { /* 수집 실패가 앱을 깨면 안 됨 */ }
}

window.Analytics = { track };
