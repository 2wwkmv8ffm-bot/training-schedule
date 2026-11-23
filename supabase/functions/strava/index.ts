// ZONE 스트라바 연결 서버 기능 (Supabase Edge Function 이름: strava)
// 비밀값은 수파베이스 '비밀(Secrets)'에만 있어요: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
// 앱(휴대폰)에서는 스트라바 로그인이 바깥 브라우저로 열려서, 누가 연결을 시작했는지 '연결 번호(state)'로 기억해 둬요.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const CID = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
const SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

// 로그인한 ZONE 사용자 확인
async function userOf(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function stravaToken(body: Record<string, string>) {
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CID, client_secret: SECRET, ...body }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "스트라바 인증에 실패했어요.");
  return j;
}

// 저장된 토큰을 꺼내고, 끝나 가면 새로 받아요
async function accessOf(uid: string): Promise<string | null> {
  const { data } = await admin.from("strava_links").select("*").eq("user_id", uid).maybeSingle();
  if (!data) return null;
  if (data.expires_at - 120 > Date.now() / 1000) return data.access_token;
  const t = await stravaToken({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await admin.from("strava_links").update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, updated_at: new Date().toISOString() }).eq("user_id", uid);
  return t.access_token;
}

async function api(token: string, path: string) {
  const r = await fetch("https://www.strava.com/api/v3" + path, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 429) throw new Error("스트라바 요청이 너무 많아요. 15분 뒤에 다시 시도해 주세요.");
  if (!r.ok) throw new Error("스트라바에서 기록을 읽지 못했어요.");
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!CID || !SECRET) return fail("스트라바 설정(Client ID·Secret)이 아직 없어요.", 500);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* 빈 요청 */ }
  const action = String(b.action ?? "");
  try {
    // ① 연결 시작: 연결 번호를 만들어 이 사용자와 묶어 둬요 (15분 동안 유효)
    if (action === "start") {
      const uid = await userOf(req); if (!uid) return fail("로그인이 필요해요.", 401);
      const state = crypto.randomUUID();
      await admin.from("strava_states").delete().lt("created_at", new Date(Date.now() - 15 * 60e3).toISOString());
      await admin.from("strava_states").insert({ state, user_id: uid });
      return json({ clientId: CID, state });
    }
    // ② 스트라바에서 돌아왔을 때: 로그인 없이도(바깥 브라우저) 연결 번호로 사용자를 찾아 저장해요
    if (action === "exchange") {
      const state = String(b.state ?? ""), code = String(b.code ?? ""), scope = String(b.scope ?? "");
      const { data: st } = await admin.from("strava_states").select("*").eq("state", state).maybeSingle();
      if (!st || Date.parse(st.created_at) < Date.now() - 15 * 60e3) return fail("연결 시간이 지났어요. ZONE 앱에서 다시 시도해 주세요.");
      if (!/activity:read/.test(scope)) return fail("'활동 보기' 권한을 허용해야 기록을 가져올 수 있어요. 다시 시도해 주세요.");
      const t = await stravaToken({ grant_type: "authorization_code", code });
      const name = [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(" ") || null;
      await admin.from("strava_links").upsert({ user_id: st.user_id, athlete_id: t.athlete?.id ?? null, athlete_name: name, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, updated_at: new Date().toISOString() });
      await admin.from("strava_states").delete().eq("state", state);
      return json({ ok: true, athlete: name });
    }
    const uid = await userOf(req); if (!uid) return fail("로그인이 필요해요.", 401);
    if (action === "status") {
      const { data } = await admin.from("strava_links").select("athlete_name").eq("user_id", uid).maybeSingle();
      return json({ connected: !!data, athlete: data?.athlete_name ?? null });
    }
    const token = await accessOf(uid);
    if (!token) return fail("스트라바가 연결돼 있지 않아요.");
    if (action === "list") {
      const q = new URLSearchParams({ per_page: String(Math.min(50, Number(b.per_page) || 30)), page: String(Number(b.page) || 1) });
      if (b.after) q.set("after", String(Math.floor(Number(b.after))));
      return json({ items: await api(token, "/athlete/activities?" + q) });
    }
    if (action === "detail") {
      const id = String(b.id ?? "").replace(/\D/g, "");
      if (!id) return fail("기록 번호가 없어요.");
      return json({ streams: await api(token, `/activities/${id}/streams?keys=time,latlng,heartrate,distance&key_by_type=true`) });
    }
    if (action === "disconnect") {
      await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      await admin.from("strava_links").delete().eq("user_id", uid);
      return json({ ok: true });
    }
    return fail("알 수 없는 요청이에요.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "서버 오류", 500);
  }
});
