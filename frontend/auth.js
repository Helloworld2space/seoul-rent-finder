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

window.Auth = {
  initAuth, onAuth, signInWithGoogle, signOut, getUser,
  dealKey, fetchFavorites, addFavorite, removeFavorite,
};
