"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type AvatarView } from "@/components/Avatars";
import { MainHeader } from "@/components/MainHeader";
import { AvatarPicker } from "@/components/AvatarPicker";
import { MemberStatusBox } from "@/components/MemberStatusBox";
import { MemberTabs } from "@/components/MemberTabs";
import { applyScale, applyTheme, readScale, SCALE_DEFAULT, SCALE_LEVELS, SCALE_NARROW_MAX } from "@/components/ThemeBoot";
import { api } from "@/lib/client";
import { mergePrefs, type Prefs, type PrefsInput } from "@/lib/prefs";
import { disablePush, enablePush, pushSupported } from "@/lib/push-client";
import { fs } from "@/lib/fs";
import { AddToHome } from "@/components/AddToHome";
import { typePhone } from "@/lib/phone";

type Me = {
  name: string; perms: string[]; admin: boolean; consent: boolean; gender: string;
  company: string; title: string; phone: string;
  clubs: { name: string; role: string }[]; clubOptions: string[]; headClubs: string[];
  prefs: Prefs;
  avatar: AvatarView;
  bookShown?: boolean; // 프로필 북에 내가 보이는지
  kind?: string; // 회원구분(대기회원·참관회원은 프로필 북에 안 나온다)
};

// 받을 알림 종류. adminOnly 는 신청을 처리하는 사람(관리자 권한이 있거나 클럽 직책을 맡은 회원)에게만 보인다.
const NOTIFY_OPTS: { k: keyof Prefs["notify"]; label: string; title: string; adminOnly?: boolean }[] = [
  { k: "events", label: "일정", title: "일정이 공개되거나 바뀌면 알려 드려요" },
  { k: "notices", label: "공지", title: "공지 글이 올라오면 알려 드려요(게시글 알림을 꺼도 공지는 받아요)" },
  { k: "posts", label: "게시글", title: "공지를 포함한 모든 게시글이 올라오면 알려 드려요" },
  { k: "profiles", label: "프로필 북", title: "프로필 북에 소개가 공개되거나 바뀌면 알려 드려요" },
  { k: "feedback", label: "신청 피드백", title: "내가 낸 회원·클럽·참관 신청이 승인되거나 반려되면 알려 드려요" },
  { k: "requests", label: "신청", title: "처리할 신청(회원·클럽 신청, 입금 알림, 사진 장수 요청)이 들어오면 알려 드려요", adminOnly: true },
];
const ROLE_MSG = "클럽 직책이 있는 클럽은 관리자에게 변경을 요청해 주세요.";

const digits = (s: string) => s.replace(/\D/g, "");
const col = { display: "flex", flexDirection: "column", gap: 8 } as const;

// 켜기·끄기 스위치 한 줄(목업 C: 왼쪽 이름, 오른쪽 스위치, 줄 사이 얇은 선)
function Switch({ id, label, sub, on, disabled, onChange }: { id: string; label: string; sub?: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="srow">
      <span className="k">
        <span id={`${id}-l`} style={{ display: "block" }}>{label}</span>
        {sub && <span className="small" style={{ display: "block", fontSize: fs(12) }} id={`${id}-d`}>{sub}</span>}
      </span>
      <button
        type="button" role="switch" className="switch" aria-checked={on} aria-labelledby={`${id}-l`}
        aria-describedby={sub ? `${id}-d` : undefined} disabled={disabled} onClick={() => onChange(!on)}
      />
    </div>
  );
}

// 회원 설정 탭: 위쪽 관리자 아이콘(관리자만)·이름 줄 로그아웃, 내 정보, 화면 모드, 글자 크기, 받을 알림, 알림 설정.
export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // 내 정보 입력칸(저장 버튼으로 한 번에 저장)
  const [form, setForm] = useState({ company: "", title: "", phone: "" });
  // 글자 크기: 이 기기에만 저장(서버 저장 없음)
  const [addingClub, setAddingClub] = useState(false);
  const [clubPick, setClubPick] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  // 내가 보낸 클럽 가입 신청 중 아직 처리되지 않은 것(클럽 이름 + 신청 id: 취소할 때)
  const [pendingReqs, setPendingReqs] = useState<{ id: string; club: string }[]>([]);
  const pendingJoins = pendingReqs.map((x) => x.club);
  const loadPending = () =>
    api<{ mine: { id: string; kind: string; club: string; status: string }[] }>("/api/alerts").then((r) => {
      if (r.ok) setPendingReqs(r.data.mine.filter((x) => x.kind === "join" && x.status === "pending").map((x) => ({ id: x.id, club: x.club })));
    });
  // 승인 대기 중인 가입 신청 취소(클럽 관리자가 처리하기 전까지)
  async function cancelJoin(req: { id: string; club: string }) {
    if (!window.confirm(`${req.club} 가입 신청을 취소할까요?`)) return;
    const r = await api(`/api/club-requests/${req.id}`, { method: "DELETE" });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "ok", text: `${req.club} 가입 신청을 취소했어요.` });
    loadPending();
  }
  useEffect(() => {
    loadPending();
  }, []);
  async function requestJoin() {
    if (!clubPick) return;
    const r = await api("/api/club-requests", { body: { kind: "join", club: clubPick, message: joinMsg.trim() } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "ok", text: `${clubPick} 클럽에 가입 신청을 보냈어요. 클럽 임원이 승인하면 알려 드려요.` });
    setAddingClub(false);
    loadPending();
  }
  // 띠를 끄는 동안에는 미리보기만 바꾸고, 손을 떼면(또는 키보드로 바꾸면) 화면 전체에 적용한다.
  const [scale, setScale] = useState(SCALE_DEFAULT);
  const [applied, setApplied] = useState(SCALE_DEFAULT);
  // 폭 400px 미만 휴대폰은 배율 상한(SCALE_NARROW_MAX)이 있어 미리보기도 같은 상한으로 계산한다.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const v = readScale();
    setScale(v);
    setApplied(v);
    setNarrow(window.innerWidth < 400);
  }, []);
  const effScale = (lv: number) => {
    const z = SCALE_LEVELS[lv - 1];
    return narrow ? Math.min(z, SCALE_NARROW_MAX) : z;
  };
  function commitScale(v: number) {
    if (v === applied) return;
    setApplied(v);
    applyScale(v);
  }

  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      if (r.ok) {
        setMe(r.data);
        setForm({ company: r.data.company, title: r.data.title, phone: r.data.phone });
        applyTheme(r.data.prefs.screen);
      } else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
  }, [router]);

  async function patch(body: Record<string, unknown>, okText?: string): Promise<Me | null> {
    setSaving(true);
    const r = await api<Me>("/api/me", { method: "PATCH", body });
    setSaving(false);
    if (!r.ok) {
      setNote({ tone: "bad", text: r.error });
      return null;
    }
    setMe(r.data);
    setNote(okText ? { tone: "ok", text: okText } : null);
    return r.data;
  }

  async function saveGender(gender: "남" | "여") {
    if (!me || me.gender === gender) return;
    await patch({ gender }, "성별을 저장했어요.");
  }

  // 회사명·직책·휴대폰 번호
  const phoneDigits = digits(form.phone);
  const phoneChanged = me != null && phoneDigits !== digits(me.phone);
  const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 11;
  const infoChanged = me != null && (form.company.trim() !== me.company || form.title.trim() !== me.title || phoneChanged);
  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !infoChanged) return;
    if (phoneChanged && !phoneOk) return setNote({ tone: "bad", text: "휴대폰 번호는 숫자 10~11자리로 적어 주세요." });
    if (phoneChanged && !window.confirm(`다음 로그인부터 초대코드가 ${phoneDigits.slice(-4)}로 바뀌어요.\n저장할까요?`)) return;
    const body: Record<string, string> = {};
    if (form.company.trim() !== me.company) body.company = form.company.trim();
    if (form.title.trim() !== me.title) body.title = form.title.trim();
    if (phoneChanged) body.phone = form.phone;
    const d = await patch(body, phoneChanged ? `저장했어요. 다음 로그인부터 초대코드는 ${phoneDigits.slice(-4)}이에요.` : "내 정보를 저장했어요.");
    if (d) setForm({ company: d.company, title: d.title, phone: d.phone });
  }

  // 클럽: 누르면 바로 저장. 직책이 있는 클럽은 뺄 수 없다.
  async function toggleClub(name: string) {
    if (!me) return;
    const seat = me.clubs.find((c) => c.name === name);
    if (seat?.role) return setNote({ tone: "bad", text: ROLE_MSG });
    const names = seat ? me.clubs.filter((c) => c.name !== name).map((c) => c.name) : [...me.clubs.map((c) => c.name), name];
    await patch({ clubs: names }, seat ? `${name} 클럽에서 뺐어요.` : `${name} 클럽을 더했어요.`);
  }

  // 화면 모드·알림: 누르면 바로 화면에 반영하고 저장한다. 실패하면 되돌린다.
  async function savePrefs(p: PrefsInput) {
    if (!me) return;
    const before = me;
    const next = mergePrefs(me.prefs, p);
    setMe({ ...me, prefs: next });
    if (p.screen) applyTheme(p.screen);
    const d = await patch({ prefs: p });
    if (!d) {
      setMe(before);
      if (p.screen) applyTheme(before.prefs.screen);
    }
  }

  // 이 기기의 휴대폰 알림 구독 상태(알림 ON 이어도 기기마다 한 번 허용해야 한다)
  const [device, setDevice] = useState<"unknown" | "on" | "off" | "unsupported">("unknown");
  useEffect(() => {
    if (!pushSupported()) return setDevice("unsupported");
    navigator.serviceWorker.getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setDevice(sub ? "on" : "off"))
      .catch(() => setDevice("off"));
  }, []);
  async function turnOnDevice() {
    const err = await enablePush();
    setDevice(err ? device : "on");
    setNote(err ? { tone: "bad", text: err } : { tone: "ok", text: "이 기기에서 휴대폰 알림을 받아요." });
  }
  async function toggleNotify(v: boolean) {
    await savePrefs({ notifyOn: v });
    if (v) await turnOnDevice();
    else {
      await disablePush();
      setDevice(pushSupported() ? "off" : "unsupported");
    }
  }

  const clubNames = me ? [...me.clubOptions, ...me.clubs.map((c) => c.name).filter((n) => !me.clubOptions.includes(n))] : [];
  // 아직 가입하지 않은 클럽(+ 클럽 추가에서 고를 수 있는 것)
  const joinable = me ? me.clubOptions.filter((n) => !me.clubs.some((c) => c.name === n)) : [];
  // 이미 가입 신청을 보낸 클럽은 다시 고를 수 없다
  const requestable = joinable.filter((n) => !pendingJoins.includes(n));
  const pr = me?.prefs;

  return (
    <main className="app with-tabs">
      {/* 홈·일정·프로필 북과 같은 윗줄(관리자·알림·조직도·로그아웃). 프로필 사진을 바꾸면 다시 그린다. */}
      <MainHeader key={JSON.stringify(me?.avatar ?? null)} />
      <h1 className="title">설정</h1>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!me && !error && <p className="small">불러오는 중이에요…</p>}
      {me && pr && (
        <>
          <div aria-live="polite" role="status">
            {note && <div className={`msg ${note.tone === "bad" ? "bad" : "ok"}`}>{note.text}</div>}
          </div>

          {/* 회원 정보: 회원구분·신청 상태, 회원 권한 수정(승인 요청), 회원 탈퇴 */}
          <MemberStatusBox />

          {/* 1. 내 정보 */}
          <section className="sect" aria-labelledby="s-me">
            <h2 id="s-me">내 정보</h2>
            <div className="sect-body" style={{ gap: 14 }}>

            <AvatarPicker name={me.name} avatar={me.avatar} onChange={(avatar, text) => { setMe((m) => (m ? { ...m, avatar } : m)); setNote({ tone: "ok", text }); }} />

            <div style={{ ...col, gap: 4 }}>
              <div className="row">
                <span id="g-l" className="grow" style={{ fontSize: fs(14) }}>성별</span>
                <div className="seg" role="group" aria-labelledby="g-l" style={{ width: 132, flex: "none" }}>
                  {(["남", "여"] as const).map((x) => (
                    <button key={x} type="button" aria-pressed={me.gender === x} disabled={saving} onClick={() => saveGender(x)} style={{ minHeight: 40, fontSize: fs(13) }}>
                      {x}
                    </button>
                  ))}
                </div>
              </div>
              <span className="small" style={{ fontSize: fs(12) }}>{me.gender ? "누르면 바로 저장돼요." : "아직 성별이 없어요. 명리학 풀이를 보려면 골라 주세요."}</span>
            </div>

            <form onSubmit={saveInfo} style={{ ...col, gap: 10 }}>
              <div>
                <label className="l" htmlFor="f-co">회사명</label>
                <input id="f-co" className="field" maxLength={60} autoComplete="organization" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <label className="l" htmlFor="f-ti">직책</label>
                <input id="f-ti" className="field" maxLength={40} autoComplete="organization-title" placeholder="예: 대표" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="l" htmlFor="f-ph">핸드폰번호</label>
                <input
                  id="f-ph" className="field" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={20}
                  aria-describedby="f-ph-d" aria-invalid={phoneChanged && !phoneOk}
                  value={form.phone} onChange={(e) => setForm({ ...form, phone: typePhone(e.target.value) })}
                />
                <span id="f-ph-d" className="small" style={{ display: "block", marginTop: 4 }}>
                  {phoneChanged && !phoneOk
                    ? "숫자 10~11자리로 적어 주세요."
                    : phoneChanged
                      ? `저장하면 다음 로그인부터 초대코드가 ${phoneDigits.slice(-4)}로 바뀌어요.`
                      : "초대코드(로그인 번호)는 핸드폰번호 뒷자리 4자리예요."}
                </span>
              </div>
              {phoneChanged && phoneOk && (
                <div className="msg info" style={{ fontSize: fs(15) }}>다음 로그인부터 초대코드가 <b>{phoneDigits.slice(-4)}</b>로 바뀌어요. 잊지 않게 기억해 주세요.</div>
              )}
              <button className="btn" type="submit" disabled={saving || !infoChanged}>내 정보 저장</button>
            </form>

            {/* 클럽: 내가 가입한 클럽만 보여 주고, "+ 클럽 추가"로 더한다 */}
            <div style={col}>
              <span className="l" id="c-l" style={{ marginBottom: 0 }}>내 클럽</span>
              {me.clubs.length === 0 && <span className="small">아직 가입한 클럽이 없어요.</span>}
              {me.clubs.length > 0 && (
                <ul aria-labelledby="c-l" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {me.clubs.map((c) => (
                    <li key={c.name} className="row" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 6px 6px 12px", background: "var(--card)" }}>
                      <b className="grow">{c.name}</b>
                      {c.role && <span className="pill ok">{c.role}</span>}
                      {me.headClubs.includes(c.name) && (
                        <Link href={`/clubs/${encodeURIComponent(c.name)}/dues`} className="mini" style={{ textDecoration: "none" }} aria-label={`${c.name} 회비 관리`}>회비 관리</Link>
                      )}
                      {c.role
                        ? <span className="small" style={{ fontSize: fs(13) }}>관리자에게 변경 요청</span>
                        : <button className="mini danger" type="button" disabled={saving} aria-label={`${c.name} 클럽에서 빠지기`}
                            onClick={() => window.confirm(`${c.name} 클럽에서 빠질까요?`) && toggleClub(c.name)}>빼기</button>}
                    </li>
                  ))}
                </ul>
              )}
              {/* 가입 신청 중(클럽 임원 승인 대기) */}
              {pendingJoins.length > 0 && (
                <ul aria-label="가입 신청 중인 클럽" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {pendingReqs.map((q) => (
                    <li key={q.id} className="row" style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: "8px 12px", gap: 8 }}>
                      <b className="grow">{q.club}</b>
                      <span className="pill gray">승인 대기</span>
                      <button className="mini" type="button" onClick={() => cancelJoin(q)} aria-label={`${q.club} 가입 신청 취소`}>신청 취소</button>
                    </li>
                  ))}
                </ul>
              )}
              {!addingClub ? (
                <button className="btn white" type="button" disabled={saving || requestable.length === 0} aria-expanded={false}
                  style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: fs(15) }} onClick={() => { setAddingClub(true); setClubPick(requestable[0] ?? ""); setJoinMsg(""); }}>
                  + 클럽 가입 신청
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <select className="field" aria-label="가입 신청할 클럽" style={{ flex: "1 1 160px", width: "auto", minHeight: 46 }} value={clubPick} onChange={(e) => setClubPick(e.target.value)}>
                      {requestable.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <input className="field" aria-label="클럽 임원에게 한마디 (선택)" placeholder="클럽 임원에게 한마디 (선택)" maxLength={200} value={joinMsg} onChange={(e) => setJoinMsg(e.target.value)} />
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <button className="btn" type="button" disabled={saving || !clubPick} style={{ width: "auto", minHeight: 46, fontSize: fs(15) }} onClick={requestJoin}>신청 보내기</button>
                    <button className="btn white" type="button" style={{ width: "auto", minHeight: 46, fontSize: fs(15) }} onClick={() => setAddingClub(false)}>취소</button>
                  </div>
                </div>
              )}
              <span className="small">
                {clubNames.length === 0
                  ? "아직 등록된 클럽이 없어요. 관리자가 클럽을 만들면 신청할 수 있어요."
                  : requestable.length === 0 && joinable.length === 0 ? "등록된 클럽에 모두 가입했어요."
                  : "가입 신청을 보내면 클럽 임원(대표·총무 등)이 승인해요. 승인되면 알림으로 알려 드려요. 클럽 직책은 관리자가 정해요."}
              </span>
            </div>
            </div>
          </section>

          {/* 2. 화면 모드: 어두운 화면(기본) / 밝은 화면 / 폰 설정 따라. 누르면 바로 바뀌고 회원 설정에 저장(다른 기기에서도 같게) */}
          <section className="sect" aria-labelledby="s-mode">
            <h2 id="s-mode">화면 모드</h2>
            <div className="sect-body" style={{ gap: 8 }}>
              <div className="mode-pick" role="radiogroup" aria-labelledby="s-mode">
                {([["dark", "어두운 화면"], ["light", "밝은 화면"], ["system", "폰 설정 따라"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={pr.screen === k} className={`mode-opt ${k}`} onClick={() => pr.screen !== k && savePrefs({ screen: k })}>
                    <span className="mode-sw" aria-hidden="true"><i /></span>
                    {label}
                  </button>
                ))}
              </div>
              <span className="small" style={{ fontSize: fs(12) }}>
                {pr.screen === "light" ? "밝은 바탕에 레몬 포인트로 보여요." : pr.screen === "system" ? "폰이 다크 모드면 어두운 화면, 아니면 밝은 화면으로 바뀌어요." : "그래파이트 바탕에 레몬 포인트(기본)로 보여요."} 내 계정에 저장돼서 다른 기기에서 로그인해도 같게 보여요.
              </span>
            </div>
          </section>

          {/* 3. 화면: 글자 크기(이 기기만) */}
          <section className="sect" aria-labelledby="s-scale">
            <h2 id="s-scale">글자 크기</h2>
            <div className="sect-body" style={{ gap: 6 }}>
            <div className="row" style={{ alignItems: "baseline" }}>
              <span className="grow" style={{ fontSize: `calc(${fs(16)} * ${+(effScale(scale) / effScale(applied)).toFixed(4)})` }} aria-hidden="true">가나다 Aa 123</span>
              <span className="num small" style={{ fontSize: fs(13) }} aria-hidden="true">{scale}단계{scale === SCALE_DEFAULT ? " (보통)" : ""}</span>
            </div>
            <input
              type="range" className="scale-range" min={1} max={10} step={1} value={scale}
              aria-labelledby="s-scale" aria-valuetext={`${scale}단계${scale === SCALE_DEFAULT ? ", 보통" : ""}`}
              onChange={(e) => setScale(Number(e.target.value))}
              onPointerUp={(e) => commitScale(Number(e.currentTarget.value))}
              onKeyUp={(e) => commitScale(Number(e.currentTarget.value))}
              onBlur={(e) => commitScale(Number(e.currentTarget.value))}
            />
            <div className="scale-ticks" aria-hidden="true">
              {SCALE_LEVELS.map((_, i) => <span key={i} aria-current={scale === i + 1}>{i + 1}</span>)}
            </div>
            <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
              <span className="small grow" style={{ fontSize: fs(12) }}>1 작게 · 5 보통 · 10 크게. 글자와 아이콘만 커지거나 작아지고 화면 너비·창 크기는 그대로예요. 띠를 끌다가 손을 떼면 화면 전체에 적용되고, 이 기기에만 저장돼요.</span>
              {applied !== SCALE_DEFAULT && <button className="mini" type="button" onClick={() => { setScale(SCALE_DEFAULT); commitScale(SCALE_DEFAULT); }}>보통으로</button>}
            </div>
            <span className="small" style={{ fontSize: fs(12) }}>폭이 좁은 휴대폰(400px 미만)에서는 글자가 넘치지 않게 8단계(130%)보다 크게는 키우지 않아요. 하단 메뉴 글자는 칸에 맞게 조금만 커져요. PC 에서는 앱 화면 오른쪽 가장자리의 손잡이를 끌어 화면 너비도 바꿀 수 있어요(두 번 누르면 원래대로).</span>
            </div>
          </section>

          {/* 프로필 북 노출 */}
          <section className="sect" aria-labelledby="s-book">
            <h2 id="s-book">프로필 북</h2>
            {(() => {
              // 대기회원·참관회원은 프로필 북에 나오지 않는다: 스위치는 꺼진 모양, 켜려고 하면 알림만
              const guest = ["대기회원", "회원대기", "참관회원", "행사참관"].includes(me.kind ?? "");
              const on = !guest && me.bookShown !== false;
              return (
                <Switch id="sw-book" label="프로필 북에 나를 보이기" on={on} disabled={saving}
                  sub={guest ? `${me.kind}은 프로필 북에 공개되지 않아요. 위 “회원 권한 수정”으로 관리자에게 회원 업데이트를 요청하세요.` : on ? "다른 회원이 프로필 북에서 내 이름·소개를 볼 수 있어요." : "프로필 북에서 빠져 있어요. 다른 회원에게 내 이름·소개가 보이지 않아요(나에게만 보여요)."}
                  onChange={(v) => {
                    if (guest && v) return window.alert(`${me.kind}은 프로필북에 공개되지 않습니다. “설정”에서 관리자에게 회원 업데이트를 요청하세요.`);
                    patch({ bookShown: v }, v ? "프로필 북에 보이게 했어요." : "프로필 북에서 뺐어요.");
                  }} />
              );
            })()}
          </section>

          {/* 3. 받을 알림 */}
          <section className="sect" aria-labelledby="s-notify">
            <h2 id="s-notify">받을 알림</h2>
            <div className="sect-body">
            <div className="checks" role="group" aria-labelledby="s-notify">
              {NOTIFY_OPTS.filter((o) => !o.adminOnly || (me?.perms.length ?? 0) > 0 || (me?.clubs ?? []).some((c) => c.role)).map((o) => {
                // 게시글을 받으면 공지도 받는다: 게시글을 켜면 공지도 켜고, 게시글이 켜진 동안 공지 칸은 체크된 채로 잠근다
                const lockedOn = o.k === "notices" && pr.notify.posts;
                return (
                  <label key={o.k} title={lockedOn ? "게시글 알림을 받으면 공지도 함께 받아요" : o.title}>
                    <input type="checkbox" checked={lockedOn || pr.notify[o.k]} disabled={lockedOn}
                      onChange={(e) => savePrefs({ notify: o.k === "posts" && e.target.checked ? { posts: true, notices: true } : { [o.k]: e.target.checked } })} />
                    {o.label}
                  </label>
                );
              })}
            </div>
            <span className="small" style={{ fontSize: fs(12) }}>새 글이 올라오거나 수정되면 알려 드려요. 하단 아이콘에도 숫자로 표시돼요.</span>
            </div>
          </section>

          {/* 4. 알림 설정 */}
          <section className="sect" aria-labelledby="s-push">
            <h2 id="s-push">알림</h2>
            <Switch id="sw-on" label="알림 받기" sub={pr.notifyOn ? undefined : "꺼져 있어요. 알림을 보내지 않아요."} on={pr.notifyOn} onChange={toggleNotify} />
            {pr.notifyOn && (device === "off" || device === "unsupported") && (
              <div className="sect-body" style={{ paddingTop: 0, paddingBottom: 12 }}>
                {device === "off"
                  ? <button type="button" className="btn white" style={{ minHeight: 44, fontSize: fs(14) }} onClick={turnOnDevice}>이 기기에서 휴대폰 알림 받기</button>
                  : <span className="small" style={{ fontSize: fs(12) }}>이 브라우저에서는 휴대폰 알림을 받을 수 없어요. iPhone 은 아래 “홈 화면에 추가” 방법대로 설치한 앱에서 켜 주세요. 하단 아이콘 숫자는 그대로 보여요.</span>}
              </div>
            )}
            <Switch id="sw-sound" label="소리" sub={pr.notifyOn ? undefined : "알림을 켜면 고를 수 있어요"} on={pr.sound} disabled={!pr.notifyOn} onChange={(v) => savePrefs({ sound: v })} />
            <Switch id="sw-quiet" label="방해 금지 시간" sub={pr.notifyOn ? (pr.quiet.on ? `${pr.quiet.from} ~ ${pr.quiet.to}에는 알림을 보내지 않아요` : "이 시간에는 알림을 보내지 않아요") : "알림을 켜면 고를 수 있어요"} on={pr.quiet.on} disabled={!pr.notifyOn} onChange={(v) => savePrefs({ quiet: { on: v } })} />
            {pr.quiet.on && (
              <div className="timerange sect-body" role="group" aria-label="방해 금지 시간" style={{ flexDirection: "row", paddingTop: 0, paddingBottom: 12 }}>
                <input type="time" className="field" aria-label="시작 시각" value={pr.quiet.from} onChange={(e) => e.target.value && savePrefs({ quiet: { from: e.target.value } })} />
                <span aria-hidden="true">~</span>
                <input type="time" className="field" aria-label="끝 시각" value={pr.quiet.to} onChange={(e) => e.target.value && savePrefs({ quiet: { to: e.target.value } })} />
              </div>
            )}
            <p className="small" style={{ fontSize: fs(12), margin: 0, padding: "10px var(--pr) 12px var(--pl)", borderTop: "1px solid var(--line2)" }}>휴대폰 화면에는 내용 없이 새 게시물 수와 새 게시물 안내만 보여요.</p>
          </section>

          {/* 5. 홈 화면에 추가(앱처럼 설치) */}
          <AddToHome />
        </>
      )}
      <MemberTabs on="settings" />
    </main>
  );
}
