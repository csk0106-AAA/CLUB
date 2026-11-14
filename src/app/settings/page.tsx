"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLogout, IconShield } from "@/components/Icons";
import { headIcon, HEAD_ICON_MAX, HEAD_ICON_SIZE } from "@/components/HeadIcon";
import { Mascot } from "@/components/Mascot";
import { Avatar, type AvatarView } from "@/components/Avatars";
import { AvatarPicker } from "@/components/AvatarPicker";
import { MemberTabs } from "@/components/MemberTabs";
import { applyScale, applyTheme, readScale, SCALE_DEFAULT, SCALE_LEVELS, SCALE_NARROW_MAX } from "@/components/ThemeBoot";
import { api } from "@/lib/client";
import { mergePrefs, type Prefs, type PrefsInput } from "@/lib/prefs";
import { disablePush, enablePush, pushSupported } from "@/lib/push-client";
import { fs } from "@/lib/fs";

type Me = {
  name: string; perms: string[]; admin: boolean; consent: boolean; gender: string;
  company: string; title: string; phone: string;
  clubs: { name: string; role: string }[]; clubOptions: string[];
  prefs: Prefs;
  avatar: AvatarView;
};

const THEME_OPTS: { v: Prefs["theme"]; label: string; sub: string }[] = [
  { v: "system", label: "시스템", sub: "휴대폰 설정을 따라요" },
  { v: "light", label: "기본", sub: "밝은 화면" },
  { v: "dark", label: "다크", sub: "어두운 화면" },
];
const NOTIFY_OPTS: { k: keyof Prefs["notify"]; label: string }[] = [
  { k: "events", label: "일정" },
  { k: "posts", label: "공지글" },
  { k: "profiles", label: "프로필북 수정" },
];
const ROLE_MSG = "소모임 직책이 있는 소모임은 관리자에게 변경을 요청해 주세요.";

const digits = (s: string) => s.replace(/\D/g, "");
const sectionTitle = { font: `700 ${fs(15)} var(--display)` } as const;
const col = { display: "flex", flexDirection: "column", gap: 8 } as const;

// 켜기·끄기 스위치 한 줄
function Switch({ id, label, sub, on, disabled, onChange }: { id: string; label: string; sub?: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switchrow">
      <span className="grow">
        <b id={`${id}-l`}>{label}</b>
        {sub && <span className="small" style={{ display: "block" }} id={`${id}-d`}>{sub}</span>}
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
  const [club, setClub] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // 내 정보 입력칸(저장 버튼으로 한 번에 저장)
  const [form, setForm] = useState({ company: "", title: "", phone: "" });
  // 글자 크기: 이 기기에만 저장(서버 저장 없음)
  const [addingClub, setAddingClub] = useState(false);
  const [clubPick, setClubPick] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  // 내가 보낸 소모임 가입 신청 중 아직 처리되지 않은 것(소모임 이름)
  const [pendingJoins, setPendingJoins] = useState<string[]>([]);
  const loadPending = () =>
    api<{ mine: { kind: string; club: string; status: string }[] }>("/api/alerts").then((r) => {
      if (r.ok) setPendingJoins(r.data.mine.filter((x) => x.kind === "join" && x.status === "pending").map((x) => x.club));
    });
  useEffect(() => {
    loadPending();
  }, []);
  async function requestJoin() {
    if (!clubPick) return;
    const r = await api("/api/club-requests", { body: { kind: "join", club: clubPick, message: joinMsg.trim() } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "ok", text: `${clubPick} 소모임에 가입 신청을 보냈어요. 소모임 임원이 승인하면 알려 드려요.` });
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
        applyTheme(r.data.prefs.theme);
      } else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
    api<{ clubName: string }>("/api/public/club").then((c) => c.ok && setClub(c.data.clubName));
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

  // 소모임: 누르면 바로 저장. 직책이 있는 소모임은 뺄 수 없다.
  async function toggleClub(name: string) {
    if (!me) return;
    const seat = me.clubs.find((c) => c.name === name);
    if (seat?.role) return setNote({ tone: "bad", text: ROLE_MSG });
    const names = seat ? me.clubs.filter((c) => c.name !== name).map((c) => c.name) : [...me.clubs.map((c) => c.name), name];
    await patch({ clubs: names }, seat ? `${name} 소모임에서 뺐어요.` : `${name} 소모임을 더했어요.`);
  }

  // 화면 모드·알림: 누르면 바로 화면에 반영하고 저장한다. 실패하면 되돌린다.
  async function savePrefs(p: PrefsInput) {
    if (!me) return;
    const before = me;
    const next = mergePrefs(me.prefs, p);
    setMe({ ...me, prefs: next });
    if (p.theme) applyTheme(p.theme);
    const d = await patch({ prefs: p });
    if (!d) {
      setMe(before);
      if (p.theme) applyTheme(before.prefs.theme);
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

  async function logout() {
    // 로그아웃한 기기로 다른 사람 알림이 가지 않게 이 기기 구독을 푼다.
    await disablePush();
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.push("/");
  }

  const clubNames = me ? [...me.clubOptions, ...me.clubs.map((c) => c.name).filter((n) => !me.clubOptions.includes(n))] : [];
  // 아직 가입하지 않은 소모임(+ 소모임 추가에서 고를 수 있는 것)
  const joinable = me ? me.clubOptions.filter((n) => !me.clubs.some((c) => c.name === n)) : [];
  // 이미 가입 신청을 보낸 소모임은 다시 고를 수 없다
  const requestable = joinable.filter((n) => !pendingJoins.includes(n));
  const pr = me?.prefs;

  return (
    <main className="app with-tabs">
      {/* 홈 화면과 같은 윗줄: 캐릭터(왼쪽) + 관리자(권한이 있을 때만)·로그아웃 아이콘(오른쪽). 다음 줄: 이름 */}
      <header className="topbar">
        <div className="row">
          {me ? <Avatar member={me} size={44} fallback="mascot" /> : <Mascot size={44} />}
          <div className="who">
            {me && <b>{me.name} 님</b>}
            {club && <span>{club}</span>}
          </div>
          <div className="icons">
            {/* 관리자 화면 입구(관리자 비밀번호를 한 번 더 확인해요) */}
            {me && me.perms.length > 0 && (
              <Link href="/admin" aria-label="관리자 화면" title="관리자 화면" style={headIcon}>
                <IconShield size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
                관리자
              </Link>
            )}
            {me && (
              <button type="button" onClick={logout} aria-label="로그아웃" title="로그아웃" style={headIcon}>
                <IconLogout size={HEAD_ICON_SIZE} max={HEAD_ICON_MAX} />
                로그아웃
              </button>
            )}
          </div>
        </div>
      </header>
      <h1 className="title">설정</h1>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!me && !error && <p className="small">불러오는 중이에요…</p>}
      {me && pr && (
        <>
          <div aria-live="polite" role="status">
            {note && <div className={`msg ${note.tone === "bad" ? "bad" : "ok"}`}>{note.text}</div>}
          </div>

          {/* 1. 내 정보 */}
          <section className="card" aria-labelledby="s-me" style={{ ...col, gap: 12 }}>
            <b id="s-me" style={sectionTitle}>내 정보</b>

            <AvatarPicker name={me.name} avatar={me.avatar} onChange={(avatar, text) => { setMe((m) => (m ? { ...m, avatar } : m)); setNote({ tone: "ok", text }); }} />

            <div style={col}>
              <span className="l" id="g-l" style={{ marginBottom: 0 }}>성별</span>
              <div className="row" role="group" aria-labelledby="g-l">
                {(["남", "여"] as const).map((x) => (
                  <button key={x} type="button" className="opt rowopt" aria-pressed={me.gender === x} disabled={saving} onClick={() => saveGender(x)}>
                    <span className="name grow">{x}</span><span className="tick" />
                  </button>
                ))}
              </div>
              <span className="small">{me.gender ? "누르면 바로 저장돼요." : "아직 성별이 없어요. 명리학 풀이를 보려면 골라 주세요."}</span>
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
                  value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
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

            {/* 소모임: 내가 가입한 소모임만 보여 주고, "+ 소모임 추가"로 더한다 */}
            <div style={col}>
              <span className="l" id="c-l" style={{ marginBottom: 0 }}>내 소모임</span>
              {me.clubs.length === 0 && <span className="small">아직 가입한 소모임이 없어요.</span>}
              {me.clubs.length > 0 && (
                <ul aria-labelledby="c-l" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {me.clubs.map((c) => (
                    <li key={c.name} className="row" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 6px 6px 12px", background: "var(--card)" }}>
                      <b className="grow">{c.name}</b>
                      {c.role && <span className="pill ok">{c.role}</span>}
                      {c.role
                        ? <span className="small" style={{ fontSize: fs(13) }}>관리자에게 변경 요청</span>
                        : <button className="mini danger" type="button" disabled={saving} aria-label={`${c.name} 소모임에서 빠지기`}
                            onClick={() => window.confirm(`${c.name} 소모임에서 빠질까요?`) && toggleClub(c.name)}>빼기</button>}
                    </li>
                  ))}
                </ul>
              )}
              {/* 가입 신청 중(소모임 임원 승인 대기) */}
              {pendingJoins.length > 0 && (
                <ul aria-label="가입 신청 중인 소모임" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {pendingJoins.map((n) => (
                    <li key={n} className="row" style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: "8px 12px" }}>
                      <b className="grow">{n}</b>
                      <span className="pill gray">승인 대기</span>
                    </li>
                  ))}
                </ul>
              )}
              {!addingClub ? (
                <button className="btn white" type="button" disabled={saving || requestable.length === 0} aria-expanded={false}
                  style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: fs(15) }} onClick={() => { setAddingClub(true); setClubPick(requestable[0] ?? ""); setJoinMsg(""); }}>
                  + 소모임 가입 신청
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <select className="field" aria-label="가입 신청할 소모임" style={{ flex: "1 1 160px", width: "auto", minHeight: 46 }} value={clubPick} onChange={(e) => setClubPick(e.target.value)}>
                      {requestable.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <input className="field" aria-label="소모임 임원에게 한마디 (선택)" placeholder="소모임 임원에게 한마디 (선택)" maxLength={200} value={joinMsg} onChange={(e) => setJoinMsg(e.target.value)} />
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <button className="btn" type="button" disabled={saving || !clubPick} style={{ width: "auto", minHeight: 46, fontSize: fs(15) }} onClick={requestJoin}>신청 보내기</button>
                    <button className="btn white" type="button" style={{ width: "auto", minHeight: 46, fontSize: fs(15) }} onClick={() => setAddingClub(false)}>취소</button>
                  </div>
                </div>
              )}
              <span className="small">
                {clubNames.length === 0
                  ? "아직 등록된 소모임이 없어요. 관리자가 소모임을 만들면 신청할 수 있어요."
                  : requestable.length === 0 && joinable.length === 0 ? "등록된 소모임에 모두 가입했어요."
                  : "가입 신청을 보내면 소모임 임원(대표·총무 등)이 승인해요. 승인되면 알림으로 알려 드려요. 소모임 직책은 관리자가 정해요."}
              </span>
            </div>
          </section>

          {/* 2. 화면 모드 */}
          <section className="card" aria-labelledby="s-theme" style={col}>
            <b id="s-theme" style={sectionTitle}>화면 모드</b>
            {/* 작은 선택 칸 3개를 가로로 */}
            <div className="seg" role="group" aria-labelledby="s-theme">
              {THEME_OPTS.map((o) => {
                const on = pr.theme === o.v;
                return (
                  <button key={o.v} type="button" aria-pressed={on} title={o.sub} onClick={() => !on && savePrefs({ theme: o.v })}
                    style={{ minHeight: 44 }}>
                    <span aria-hidden="true">{o.v === "system" ? "◐" : o.v === "light" ? "☀" : "☾"}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
            <span className="small">{THEME_OPTS.find((o) => o.v === pr.theme)?.sub}</span>
          </section>

          {/* 2-1. 글자 크기 (이 기기만) */}
          <section className="card" aria-labelledby="s-scale" style={col}>
            <b id="s-scale" style={sectionTitle}>글자 크기</b>
            <div className="row" style={{ alignItems: "baseline" }}>
              <span className="grow" style={{ fontSize: `calc(${fs(17)} * ${+(effScale(scale) / effScale(applied)).toFixed(4)})` }} aria-hidden="true">가나다 Aa 123</span>
              <b className="num" aria-hidden="true">{scale}단계{scale === SCALE_DEFAULT ? " (보통)" : ""}</b>
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
            <div className="row" style={{ flexWrap: "wrap" }}>
              <span className="small grow">1 작게 · 5 보통 · 10 크게. 글자와 아이콘만 커지거나 작아지고 화면 너비·창 크기는 그대로예요. 띠를 끌다가 손을 떼면 화면 전체에 적용되고, 이 기기에만 저장돼요.</span>
              {applied !== SCALE_DEFAULT && <button className="mini" type="button" onClick={() => { setScale(SCALE_DEFAULT); commitScale(SCALE_DEFAULT); }}>보통으로</button>}
            </div>
            <span className="small">폭이 좁은 휴대폰(400px 미만)에서는 글자가 넘치지 않게 8단계(130%)보다 크게는 키우지 않아요. 하단 메뉴 글자는 칸에 맞게 조금만 커져요. PC 에서는 앱 화면 오른쪽 가장자리의 손잡이를 끌어 화면 너비도 바꿀 수 있어요(두 번 누르면 원래대로).</span>
          </section>

          {/* 3. 받을 알림 */}
          <section className="card" aria-labelledby="s-notify" style={col}>
            <b id="s-notify" style={sectionTitle}>받을 알림</b>
            <div className="checks" role="group" aria-labelledby="s-notify">
              {NOTIFY_OPTS.map((o) => (
                <label key={o.k}>
                  <input type="checkbox" checked={pr.notify[o.k]} onChange={(e) => savePrefs({ notify: { [o.k]: e.target.checked } })} />
                  {o.label}
                </label>
              ))}
            </div>
            <span className="small">새 글이 올라오거나 수정되면 알려 드려요. 하단 아이콘에도 숫자로 표시돼요.</span>
          </section>

          {/* 4. 알림 설정 */}
          <section className="card" aria-labelledby="s-push" style={col}>
            <b id="s-push" style={sectionTitle}>알림 설정</b>
            <Switch id="sw-on" label="알림" sub={pr.notifyOn ? "켜져 있어요" : "꺼져 있어요. 알림을 보내지 않아요."} on={pr.notifyOn} onChange={toggleNotify} />
            {pr.notifyOn && device === "off" && (
              <button type="button" className="btn white" style={{ minHeight: 46, fontSize: fs(15) }} onClick={turnOnDevice}>이 기기에서 휴대폰 알림 받기</button>
            )}
            {pr.notifyOn && device === "unsupported" && (
              <span className="small">이 브라우저에서는 휴대폰 알림을 받을 수 없어요. iPhone 은 공유 버튼 → “홈 화면에 추가”로 설치한 앱에서 켜 주세요. 하단 아이콘 숫자는 그대로 보여요.</span>
            )}
            <Switch id="sw-sound" label="소리" sub={pr.notifyOn ? undefined : "알림을 켜면 고를 수 있어요"} on={pr.sound} disabled={!pr.notifyOn} onChange={(v) => savePrefs({ sound: v })} />
            <Switch id="sw-quiet" label="방해 금지 시간" sub={pr.notifyOn ? "이 시간에는 알림을 보내지 않아요" : "알림을 켜면 고를 수 있어요"} on={pr.quiet.on} disabled={!pr.notifyOn} onChange={(v) => savePrefs({ quiet: { on: v } })} />
            {pr.quiet.on && (
              <div className="timerange" role="group" aria-label="방해 금지 시간">
                <input type="time" className="field" aria-label="시작 시각" value={pr.quiet.from} onChange={(e) => e.target.value && savePrefs({ quiet: { from: e.target.value } })} />
                <span aria-hidden="true">~</span>
                <input type="time" className="field" aria-label="끝 시각" value={pr.quiet.to} onChange={(e) => e.target.value && savePrefs({ quiet: { to: e.target.value } })} />
              </div>
            )}
            <span className="small">휴대폰 화면에는 내용 없이 새 게시물 수와 새 게시물 안내만 보여요.</span>
          </section>
        </>
      )}
      <MemberTabs on="settings" />
    </main>
  );
}
