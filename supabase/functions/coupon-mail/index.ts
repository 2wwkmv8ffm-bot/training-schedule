// 🎟️ ZONE 쿠폰 메일 — 수파베이스 Edge Function (이름: coupon-mail)
// 쿠폰 상태를 서버에서 다시 확인한 뒤, 쿠폰마다 한 번만 메일을 보내요 (여러 번 불러도 두 번 안 가요)
//   request : 회원이 추천 쿠폰 [쿠폰 받기] → 운영자에게 '승인해 주세요'
//   review  : 월간 좋아요 1등 쿠폰 생김 → 운영자에게 '승인해 주세요'
//   approved: 운영자가 승인 → 회원에게 '쿠폰 도착' + 운영자에게 사본
//   auto    : 팔로워 1등 쿠폰 자동 사용 → 회원에게 '무료 멤버십 시작' + 운영자에게 사본
// 필요한 비밀 값 (수파베이스 → Edge Functions → Secrets 에서 직접 넣어요. 코드나 채팅에 적지 않아요)
//   GMAIL_USER         : 보내는 Gmail 주소
//   GMAIL_APP_PASSWORD : 그 Gmail의 '앱 비밀번호' (16자리)
//   OWNER_EMAIL        : 운영자가 받을 메일 (없으면 GMAIL_USER)
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16"; // 한글 제목 · 본문을 제대로 보내요

// 서버 전용 열쇠: 새 방식(SUPABASE_SECRET_KEYS)이 있으면 그걸, 없으면 예전 방식(SUPABASE_SERVICE_ROLE_KEY)
function serverKey(): string {
  try { const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); const k = j.default || Object.values(j)[0]; if (k) return String(k); } catch { /* 없음 */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const SB = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const USER = Deno.env.get("GMAIL_USER") ?? "";
const PASS = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const OWNER = Deno.env.get("OWNER_EMAIL") || USER;
const PRICE = "99,000원";
const BENEFITS = "· 한 달에 한 번 코치와 2시간 모임\n· 개인 카톡 자세 피드백\n· 코치 통화 상담";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const monthKo = (p?: string | null) => (p ? `${Number(p.slice(5, 7))}월 ` : "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const html = (text: string) => `<div style="font-family:sans-serif;font-size:15px;line-height:1.7;color:#0f172a;max-width:520px">${esc(text).replace(/\n/g, "<br>")}</div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let id = 0, action = "";
  try { const b = await req.json(); id = Number(b.id); action = String(b.action || ""); } catch { return reply({ ok: false, reason: "bad body" }, 400); }
  if (!id || !USER || !PASS) return reply({ ok: false, reason: "setup" }, 400);

  const { data: c, error: ce } = await SB.from("coupons").select("*").eq("id", id).maybeSingle();
  if (ce) return reply({ ok: false, reason: "db", detail: ce.message }, 500);
  if (!c) return reply({ ok: false, reason: "no coupon" });
  let col = "", toMember = false;
  if (action === "request" && c.source === "referral" && c.status === "pending" && c.requested_at && !c.mailed_request_at) col = "mailed_request_at";
  else if (action === "review" && c.source === "likes" && c.status === "pending" && !c.mailed_request_at) col = "mailed_request_at";
  else if (action === "approved" && c.status === "approved" && !c.mailed_at) { col = "mailed_at"; toMember = true; }
  else if (action === "auto" && c.source === "followers" && c.status === "used" && !c.mailed_at) { col = "mailed_at"; toMember = true; }
  else return reply({ ok: false, reason: "nothing to send" });

  // 먼저 '보냄'으로 표시해서 동시에 불려도 한 번만 보내요 (실패하면 되돌려요)
  const { data: claimed } = await SB.from("coupons").update({ [col]: new Date().toISOString() }).eq("id", id).is(col, null).select("id");
  if (!claimed || !claimed.length) return reply({ ok: false, reason: "already sent" });

  const { data: u } = await SB.auth.admin.getUserById(c.user_id);
  const email = u?.user?.email || "";
  const { data: m } = await SB.from("members").select("nickname").eq("id", c.user_id).maybeSingle();
  const { data: ms } = await SB.from("memberships").select("ends_on").eq("user_id", c.user_id).maybeSingle();
  const nick = m?.nickname || "회원";
  const what = c.source === "referral" ? "친구 10명 초대" : c.source === "likes" ? `${monthKo(c.period)}좋아요 1등` : `${monthKo(c.period)}팔로워 1등`;

  const mails: { to: string; subject: string; text: string }[] = [];
  if (toMember && email) {
    if (action === "auto") {
      mails.push({ to: email, subject: `[ZONE] 👑 ${what} 축하해요! 코칭 멤버십 1개월 무료`, text:
        `${nick}님, 축하해요!\n\n${what}(${c.note || ""})이 되셔서 ZONE 코칭 멤버십(월 ${PRICE})을 1개월 무료로 드려요.\n쿠폰이 자동으로 사용돼서 오늘부터 ${ms?.ends_on || ""}까지 멤버예요.\n\n멤버 혜택\n${BENEFITS}\n\n모임 · 피드백 일정은 카톡으로 안내드려요. 앱 → 나 → 💎 ZONE 코칭 멤버십에서 연락받을 카톡 아이디를 남겨 주세요.\n\nZONE 드림` });
    } else {
      mails.push({ to: email, subject: `[ZONE] 🎟️ 멤버십 1개월 무료 쿠폰이 도착했어요 (${what})`, text:
        `${nick}님, 축하해요!\n\n${what}${c.note && c.source !== "referral" ? `(${c.note})` : ""}으로 ZONE 코칭 멤버십 1개월 무료 쿠폰(${PRICE} 상당)을 드려요.\n\n쓰는 방법\n앱 → 나 → 🎟️ 내 쿠폰 → [사용하기]\n원할 때 누르면 그날부터 30일 동안 멤버예요.\n\n멤버 혜택\n${BENEFITS}\n\nZONE 드림` });
    }
  }
  const ownerTitle = col === "mailed_request_at" ? `[ZONE 운영자] 쿠폰 승인해 주세요 · ${nick} · ${what}` : `[ZONE 운영자] 사본 · ${nick}님에게 ${action === "auto" ? "무료 멤버십 시작" : "쿠폰 도착"} 메일을 보냈어요`;
  mails.push({ to: OWNER, subject: ownerTitle, text:
    `회원: ${nick}${email ? ` (${email})` : ""}\n쿠폰: ${what}${c.note ? ` · ${c.note}` : ""}\n상태: ${c.status === "pending" ? "승인 대기" : c.status === "used" ? "자동 사용됨" : "승인됨"}${ms?.ends_on ? `\n멤버십 끝나는 날: ${ms.ends_on}` : ""}\n\n${col === "mailed_request_at" ? "앱 → 나 → 🛡️ 운영자 · 멤버십 → 쿠폰 승인 대기에서 확인하고 승인해 주세요." : "회원에게 카톡으로 모임 · 피드백 일정을 안내해 주세요."}` });

  const tx = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: USER, pass: PASS } });
  try {
    for (const x of mails) await tx.sendMail({ from: `"ZONE" <${USER}>`, to: x.to, subject: x.subject, text: x.text, html: html(x.text) });
  } catch (e) {
    await SB.from("coupons").update({ [col]: null }).eq("id", id); // 다음에 다시 보낼 수 있게
    return reply({ ok: false, reason: "mail failed", detail: String(e) }, 500);
  }
  return reply({ ok: true, sent: mails.length });
});
