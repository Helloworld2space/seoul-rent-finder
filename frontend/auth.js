/**
 * Supabase 인증 + 관심 거래(favorites) 데이터 접근.
 * twinforge와 같은 Supabase 프로젝트를 공유한다(같은 구글 계정 체계).
 *
 * SUPABASE_ANON_KEY는 브라우저 배포를 전제로 설계된 공개 키다 —
 * 보안 경계는 favorites 테이블의 RLS(본인 행만 접근)가 담당한다.
 * (국토부·서울시 SERVICE_KEY처럼 백엔드에 숨겨야 하는 키와는 다름. DESIGN.md 참고)
 */
const SUPABASE_URL = 'https://xwmvozrdhvemokidcbww.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bXZvenJkaHZlbW9raWRjYnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjcwNTgsImV4cCI6MjA5MjkwMzA1OH0.y9osLg1LftGhp7hC0-Ms41Jd04uxjXmLGx1ZZE88rxU';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── 세션 ─────────────────────────────────────── */
let currentUser = null;
const authListeners = [];

/** 로그인 상태 변화 구독. 콜백은 (user|null) 을 받는다. 등록 즉시 현재 상태로 1회 호출. */
function onAuth(cb) {
  authListeners.push(cb);
  cb(currentUser);
}

function emitAuth() {
  authListeners.forEach((cb) => cb(currentUser));
}

async function initAuth() {
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user ?? null;
  emitAuth();
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    emitAuth();
  });
}

function signInWithGoogle() {
  return sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

function signOut() {
  return sb.auth.signOut();
}

function getUser() {
  return currentUser;
}

/* ── favorites ────────────────────────────────── */
/** RentDeal → 중복 방지용 자연키 */
function dealKey(d) {
  return [d.district, d.dong, d.aptName, d.propertyType, d.dealDate, d.deposit, d.monthlyRent, d.area, d.floor].join('|');
}

/** 내 관심 거래 전체 (최신 저장순) */
async function fetchFavorites() {
  const { data, error } = await sb
    .from('favorites')
    .select('deal_key, deal, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error('관심 목록 조회 실패: ' + error.message);
  return data;
}

async function addFavorite(deal) {
  const { error } = await sb.from('favorites').insert({
    user_id: currentUser.id,
    deal_key: dealKey(deal),
    deal,
  });
  // 23505 = unique 위반(이미 저장됨) — 무해하므로 무시
  if (error && error.code !== '23505') throw new Error('저장 실패: ' + error.message);
}

async function removeFavorite(key) {
  const { error } = await sb.from('favorites').delete().eq('deal_key', key);
  if (error) throw new Error('삭제 실패: ' + error.message);
}

/* ── 동의 기록 / 회원 탈퇴 ────────────────────── */
const CONSENT_VERSION = '2026-07-11'; // terms/privacy.html 버전과 일치시킬 것

/** 현재 버전의 필수 동의 기록이 있는지 */
async function hasCurrentConsent() {
  const { data, error } = await sb
    .from('user_consents')
    .select('consent_key')
    .eq('version', CONSENT_VERSION)
    .eq('agreed', true);
  if (error) throw new Error('동의 이력 조회 실패: ' + error.message);
  const keys = new Set((data ?? []).map((r) => r.consent_key));
  return ['age14', 'terms', 'privacy', 'cross_border'].every((k) => keys.has(k));
}

/** 동의 항목 일괄 기록. entries: { age14: true, terms: true, ..., analytics: false } */
async function recordConsents(entries) {
  const rows = Object.entries(entries).map(([consent_key, agreed]) => ({
    user_id: currentUser.id,
    consent_key,
    agreed,
    version: CONSENT_VERSION,
  }));
  const { error } = await sb.from('user_consents').insert(rows);
  if (error) throw new Error('동의 기록 실패: ' + error.message);
}

/**
 * 회원 탈퇴 — 계정과 관심 거래·동의 이력을 즉시 파기.
 * auth.users는 postgres 롤에도 DELETE 권한이 없어(Supabase 보안 정책) RPC로 직접
 * 지울 수 없다 — service_role 키가 필요한 Admin API를 Edge Function 안에서만 호출한다.
 * (supabase/functions/delete-account/index.ts)
 */
async function deleteAccount() {
  const { data: { session } } = await sb.auth.getSession();
  const { error } = await sb.functions.invoke('delete-account', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw new Error('탈퇴 처리 실패: ' + error.message);
  await sb.auth.signOut();
}

window.Auth = {
  initAuth, onAuth, signInWithGoogle, signOut, getUser,
  dealKey, fetchFavorites, addFavorite, removeFavorite,
  CONSENT_VERSION, hasCurrentConsent, recordConsents, deleteAccount,
};
