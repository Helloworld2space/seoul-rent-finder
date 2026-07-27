// 회원 탈퇴 Edge Function.
// auth.users는 postgres 롤에도 DELETE 권한이 없어(Supabase 보안 정책) SQL RPC로는
// 직접 지울 수 없다. service_role 키로만 가능한 Admin API를, 이 키가 브라우저에
//절대 노출되지 않도록 Edge Function 안에서만 호출한다.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY는
// Supabase가 모든 Edge Function 런타임에 자동으로 주입하는 값 — 별도 설정 불필요.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: '인증 정보가 없습니다.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 요청자 신원 확인 — 요청에 실린 사용자 토큰으로 검증(anon 클라이언트만 사용)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: '사용자를 확인할 수 없습니다.' }, 401);

    // 본인 계정만 삭제. favorites·user_consents는 FK on delete cascade로 함께 파기된다.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
