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
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const monthKo = (p?: string | null) => (p ? `${Number(p.slice(5, 7))}월 ` : "");
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const LOGO = "https://2wwkmv8ffm-bot.github.io/training-schedule/app-icon-1024.png";
const APP = "https://2wwkmv8ffm-bot.github.io/training-schedule/";

// 📧 ZONE 메일 모양: 위에 앱 마크 + ZONE, 큰 제목, 내용 상자, 버튼, 아래 안내
type Mail = { to: string; subject: string; title: string; lead: string; box?: [string, string][]; list?: [string, string[]]; button?: string; foot: string };
function render(m: Mail): { html: string; text: string } {
  const rows = (m.box || []).map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;width:96px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:600">${esc(v)}</td></tr>`).join("");
  const list = m.list ? `<p style="margin:22px 0 8px;font-size:15px;font-weight:800;color:#0f172a">${esc(m.list[0])}</p>${m.list[1].map((x) => `<p style="margin:0 0 6px;font-size:15px;color:#334155">✔️ ${esc(x)}</p>`).join("")}` : "";
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#eef2f8;font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#1d4ed8;padding:22px 24px"><table cellpadding="0" cellspacing="0"><tr>
<td><img src="${LOGO}" width="44" height="44" alt="ZONE" style="display:block;border-radius:11px;border:0"></td>
<td style="padding-left:12px;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:4px">ZONE</td></tr></table></td></tr>
<tr><td style="padding:28px 24px 8px">
<p style="margin:0 0 10px;font-size:22px;font-weight:900;color:#0f172a;line-height:1.35">${esc(m.title)}</p>
<p style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.7">${esc(m.lead).replace(/\n/g, "<br>")}</p>
${rows ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:12px;padding:10px 16px">${rows}</table>` : ""}
${list}
${m.button ? `<table cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:#1d4ed8;border-radius:12px"><a href="${APP}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none">${esc(m.button)}</a></td></tr></table>` : ""}
</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12.5px;color:#94a3b8;line-height:1.6;border-top:1px solid #e2e8f0">${esc(m.foot)}<br>ZONE · 수영 · 자전거 · 달리기 · 철인3종 맞춤 훈련</td></tr>
</table></td></tr></table></body></html>`;
  const text = [m.title, "", m.lead, "", ...(m.box || []).map(([k, v]) => `${k}: ${v}`), ...(m.list ? ["", m.list[0], ...m.list[1].map((x) => "- " + x)] : []), "", m.foot].join("\n");
  return { html, text };
}
const BEN: [string, string[]] = ["멤버 혜택", ["한 달에 한 번 코치와 2시간 모임", "개인 카톡 자세 피드백", "코치 통화 상담"]];

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
  const what = c.source === "referral" ? "친구 10명 초대" : c.source === "likes" ? `${monthKo(c.period)}좋아요 1등` : c.source === "gift" ? `ZONE 선물${c.note && c.note !== "운영자 선물" ? ` (${c.note})` : ""}` : `${monthKo(c.period)}팔로워 1등`;

  const mails: Mail[] = [];
  if (toMember && email) {
    if (action === "auto") {
      mails.push({ to: email, subject: `[ZONE] 👑 ${what} 축하해요! 코칭 멤버십 1개월 무료`,
        title: `👑 ${nick}님, ${what} 축하해요!`,
        lead: `ZONE 코칭 멤버십(월 ${PRICE})을 1개월 무료로 드려요.\n쿠폰이 자동으로 사용돼서 오늘부터 바로 멤버예요.`,
        box: [["받은 이유", `${what}${c.note ? ` · ${c.note}` : ""}`], ["멤버 기간", `오늘부터 ${ms?.ends_on || ""}까지`], ["혜택 가치", `${PRICE} 상당`]],
        list: BEN, button: "ZONE 앱 열기",
        foot: "모임 · 피드백 일정은 카톡으로 안내드려요. 앱 → 나 → 💎 ZONE 코칭 멤버십에서 연락받을 카톡 아이디를 남겨 주세요." });
    } else {
      mails.push({ to: email, subject: `[ZONE] 🎟️ 멤버십 1개월 무료 쿠폰이 도착했어요`,
        title: `🎟️ ${nick}님, 무료 쿠폰이 도착했어요!`,
        lead: `ZONE 코칭 멤버십 1개월 무료 쿠폰(${PRICE} 상당)을 드려요.\n원할 때 사용하면 그날부터 30일 동안 멤버예요.`,
        box: [["받은 이유", what + (c.note && (c.source === "likes" || c.source === "followers") ? ` · ${c.note}` : "")], ["쓰는 방법", "앱 → 나 → 🎟️ 내 쿠폰 → [사용하기]"], ["혜택 가치", `${PRICE} 상당`]],
        list: BEN, button: "쿠폰 쓰러 가기",
        foot: "이 메일은 ZONE에서 쿠폰을 받으신 분께 보내 드렸어요." });
    }
  }
  const ask = col === "mailed_request_at";
  mails.push({ to: OWNER,
    subject: ask ? `[ZONE 운영자] 쿠폰 승인해 주세요 · ${nick} · ${what}` : `[ZONE 운영자] ${nick}님에게 ${action === "auto" ? "무료 멤버십 시작" : "쿠폰 도착"} 메일을 보냈어요`,
    title: ask ? "🛡️ 쿠폰 승인 요청이 왔어요" : `🛡️ ${nick}님에게 쿠폰 메일을 보냈어요`,
    lead: ask ? "확인하고 승인해 주세요. 승인하면 회원에게 메일이 가요." : "회원에게 카톡으로 모임 · 피드백 일정을 안내해 주세요.",
    box: [["회원", `${nick}${email ? ` (${email})` : ""}`], ["쿠폰", `${what}${c.note ? ` · ${c.note}` : ""}`], ["상태", c.status === "pending" ? "승인 대기" : c.status === "used" ? "자동 사용됨" : "승인됨"], ...(ms?.ends_on ? [["멤버 끝나는 날", ms.ends_on] as [string, string]] : [])],
    button: ask ? "앱에서 승인하기" : "ZONE 앱 열기",
    foot: ask ? "앱 → 나 → 🛡️ 운영자 · 멤버십 → 쿠폰 승인 대기" : "운영자에게만 보내는 사본이에요." });

  const tx = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: USER, pass: PASS } });
  try {
    for (const x of mails) { const r = render(x); await tx.sendMail({ from: `"ZONE 존" <${USER}>`, to: x.to, subject: x.subject, text: r.text, html: r.html }); }
  } catch (e) {
    await SB.from("coupons").update({ [col]: null }).eq("id", id); // 다음에 다시 보낼 수 있게
    return reply({ ok: false, reason: "mail failed", detail: String(e) }, 500);
  }
  return reply({ ok: true, sent: mails.length });
});
