"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { MemberSearch } from "@/app/events/[id]/MemberSearch";
import { ClubDuesEditor } from "@/components/ClubDuesEditor";
import { ClubRequestsAdmin } from "@/components/ClubRequestsAdmin";
import { EventCreate } from "@/components/EventCreate";
import { api, fmtWhen } from "@/lib/client";
import { fs } from "@/lib/fs";

type Info = { intro: string; cycle: string; place: string; bank: string; account: string; holder: string; feeAmount: string; feeText: string; policy: string };
type M = { id: string; name: string; kind: string; position: string };
type Seat = M & { role: string };
type Data = { name: string; info: Info; roster: Seat[]; members: M[]; clubRoles: string[]; canEditRoles: boolean };
type Note = { tone: "bad" | "info"; text: string } | null;

type Tab = "overview" | "members" | "dues" | "events" | "requests";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "소모임개요" },
  { key: "members", label: "회원관리" },
  { key: "dues", label: "회비관리" },
  { key: "events", label: "소모임일정관리" },
  { key: "requests", label: "신청내역" },
];
const isTab = (v: string | undefined): v is Tab => TABS.some((t) => t.key === v);
const head = { font: `700 ${fs(17)} var(--display)` } as const;

/* ───── 1. 소모임개요(part="info"): 소개·모임 주기·주요 장소·운영 정책
         2. 회원관리(part="members"): 소모임 회원 더하기·빼기, 소모임 직책 ───── */
function Overview({ data, onSaved, part }: { data: Data; onSaved: () => Promise<void>; part: "info" | "members" }) {
  const name = data.name;
  const [roster, setRoster] = useState<Seat[]>(data.roster);
  const [info, setInfo] = useState<Info>(data.info);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRoster(data.roster);
    setInfo(data.info);
  }, [data]);

  const rosterDirty = JSON.stringify(roster.map((s) => [s.id, s.role])) !== JSON.stringify(data.roster.map((s) => [s.id, s.role]));
  const infoDirty = JSON.stringify(info) !== JSON.stringify(data.info);
  const setI = (k: keyof Info, v: string) => setInfo({ ...info, [k]: v });
  const leaders = roster.filter((s) => s.role);

  async function saveRoster() {
    setBusy(true);
    setNote(null);
    const r = await api<{ changed: number }>(`/api/admin/clubs/${encodeURIComponent(name)}/members`, {
      method: "PUT",
      body: { seats: roster.map((s) => ({ memberId: s.id, role: s.role })) },
    });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: `소모임 회원을 저장했어요.${r.data.changed ? ` 회원 ${r.data.changed}명의 명단에 반영했어요.` : ""}` });
    await onSaved();
  }

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const r = await api(`/api/admin/clubs/${encodeURIComponent(name)}`, { method: "PUT", body: info });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: "소모임 개요를 저장했어요." });
    await onSaved();
  }

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {part === "info" && <form className="card" aria-label="소모임 개요" onSubmit={saveInfo} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={head}>소모임 개요</b>
        <div>
          <label className="l" htmlFor="c-intro">소개</label>
          <textarea id="c-intro" className="field" rows={3} maxLength={1000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }} value={info.intro} onChange={(e) => setI("intro", e.target.value)} />
        </div>
        <div className="grid2">
          <div><label className="l" htmlFor="c-cycle">모임 주기</label><input id="c-cycle" className="field" maxLength={100} placeholder="예) 매월 둘째 주 토요일" value={info.cycle} onChange={(e) => setI("cycle", e.target.value)} /></div>
          <div><label className="l" htmlFor="c-place">주요 장소</label><input id="c-place" className="field" maxLength={120} value={info.place} onChange={(e) => setI("place", e.target.value)} /></div>
        </div>
        <div>
          <label className="l" htmlFor="c-policy">운영 정책 (줄을 바꿔 여러 줄로 쓸 수 있어요)</label>
          <textarea id="c-policy" className="field" rows={6} maxLength={3000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
            placeholder={"예)\n불참 시 하루 전까지 리더에게 알려 주세요.\n회비는 그린피·식사비 실비로 정산해요."} value={info.policy} onChange={(e) => setI("policy", e.target.value)} />
        </div>
        <span className="small">입금계좌는 “회비관리” 탭에서 정해요.</span>
        <button className="btn" type="submit" disabled={busy || !infoDirty} style={{ width: "auto", minWidth: 160, minHeight: 44, fontSize: fs(14), alignSelf: "flex-end" }}>{busy ? "저장 중…" : infoDirty ? "개요 저장" : "저장됨"}</button>
      </form>}

      {part === "members" && <section className="card" aria-label="소모임 회원" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <b className="grow" style={head}>소모임 회원</b>
          <span className="pill gray">{data.roster.length}명</span>
        </div>
        <span className="small">
          소모임 직책(리더 등)을 정하면 그 회원이 신청을 승인·반려하고, 소모임 일정의 참관자를 정하고, 게시글도 쓸 수 있어요. 첫 번째 직책({data.clubRoles[0] ?? "대표"})은 소모임 회비도 정하고 올릴 수 있어요.
          {leaders.length > 0 && <> 지금: {leaders.map((l) => `${l.role} ${l.name}`).join(", ")}</>}
          {!data.canEditRoles && <> 소모임 직책을 정하거나 바꾸고, 직책자를 빼는 것은 관리자만 할 수 있어요. 일반 회원은 더하거나 뺄 수 있어요.</>}
        </span>
        {roster.length === 0 && <span className="small">아직 회원이 없어요. 아래에서 더해 주세요.</span>}
        {roster.map((s) => (
          <div key={s.id} className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            <b className="grow" style={{ minWidth: 100 }}>{s.name} <span className="small">{[s.kind, s.position].filter(Boolean).join(" · ")}</span></b>
            <select className="field" style={{ width: "auto", minWidth: 120, minHeight: 44 }} aria-label={`${s.name} 소모임 직책`} value={s.role} disabled={!data.canEditRoles}
              onChange={(e) => setRoster(roster.map((x) => (x.id === s.id ? { ...x, role: e.target.value } : x)))}>
              <option value="">일반 회원</option>
              {[...new Set([...data.clubRoles, ...(s.role ? [s.role] : [])])].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {(data.canEditRoles || !data.roster.find((x) => x.id === s.id)?.role) && (
              <button className="mini danger" type="button" onClick={() => setRoster(roster.filter((x) => x.id !== s.id))}>빼기</button>
            )}
          </div>
        ))}
        <MemberSearch
          label="회원 더하기"
          members={data.members.filter((m) => !roster.some((s) => s.id === m.id))}
          onPick={(m) => setRoster([...roster, { ...m, role: "" }])}
        />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className="grow" />
          {rosterDirty && <button className="mini" type="button" disabled={busy} onClick={() => setRoster(data.roster)}>되돌리기</button>}
          <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 44, fontSize: fs(14) }} disabled={busy || !rosterDirty} onClick={saveRoster}>
            {busy ? "저장 중…" : "회원 저장"}
          </button>
        </div>
      </section>}
    </>
  );
}

/* ───── 3. 소모임일정관리: 이 소모임 일정 만들기 + 만든 일정 목록 ───── */
type Ev = { id: string; name: string; startsAt: string; endsAt: string; place: string; published: string; pinned?: string; club?: string; total: number; attend: number; absent: number; paid: number };
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function ClubEvents({ club }: { club: string }) {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    api<{ perms: string[]; admin: boolean }>("/api/me").then((r) => {
      if (!r.ok) return;
      setCanCreate(r.data.perms.includes("all") || r.data.perms.includes("events"));
      setUnlocked(r.data.admin);
    });
    api<{ events: Ev[] }>("/api/admin/events").then((r) => {
      if (!r.ok) return setError(r.status === 403 ? "소모임 일정은 일정 권한이 있는 관리자가 만들고 관리해요." : r.error);
      setEvents(r.data.events.filter((e) => e.club === club));
    });
  }, [club]);

  const today = todayKst();
  const key = (e: Ev) => e.startsAt || "9999";
  const past = (e: Ev) => { const d = (e.endsAt || e.startsAt || "").slice(0, 10); return !!d && d < today; };
  const upcoming = (events ?? []).filter((e) => !past(e)).sort((a, b) => key(a).localeCompare(key(b)));
  const done = (events ?? []).filter(past).sort((a, b) => key(b).localeCompare(key(a)));
  const ul = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } as const;
  const item = (e: Ev) => {
    const pub = e.published === "true";
    return (
      <li key={e.id}>
        <Link href={`/admin/events/${e.id}?club=${encodeURIComponent(club)}`} className="card" aria-label={`${e.name} 일정 관리`}
          style={{ display: "flex", flexDirection: "column", gap: 6, color: "inherit", textDecoration: "none" }}>
          <span className="row" style={{ gap: 6 }}>
            <span className={`chip ${pub ? "violet" : "gray"}`}>{pub ? "공개" : "초안"}</span>
          </span>
          <b style={{ font: `700 ${fs(16)} var(--display)`, overflowWrap: "anywhere" }}>{e.name}</b>
          <span className="small">{fmtWhen(e.startsAt, e.endsAt, e.place) || "일시·장소를 아직 정하지 않았어요"}</span>
          {pub && <span className="small">참석 {e.attend} · 불참 {e.absent} · 미응답 {Math.max(0, e.total - e.attend - e.absent)}{e.attend > 0 ? ` · 입금 ${e.paid}/${e.attend}` : ""}</span>}
        </Link>
      </li>
    );
  };

  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <p className="small grow" style={{ margin: 0, fontSize: fs(12) }}>
          {club} 일정만 여기서 만들고 관리해요(관리자 › 일정관리에는 보이지 않아요). 모든 회원이 볼 수 있고, {club} 회원과 참관자만 참석 신청해요.
        </p>
        {canCreate && <button type="button" className="btn" style={{ width: "auto", minWidth: 160, minHeight: 44, fontSize: fs(14) }} aria-haspopup="dialog" onClick={() => setCreating(true)}>+ 소모임 일정 만들기</button>}
      </div>
      {error && <div className="msg info" role="status">{error}</div>}
      {!events && !error && <p className="small">불러오는 중이에요…</p>}
      {events && events.length === 0 && <div className="msg info">아직 {club} 일정이 없어요.{canCreate ? " “+ 소모임 일정 만들기”로 시작해 보세요." : ""}</div>}
      {upcoming.length > 0 && (
        <section aria-label="예정된 소모임 일정" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(15)} var(--display)` }}>예정 {upcoming.length}개</b>
          <ul style={ul}>{upcoming.map(item)}</ul>
        </section>
      )}
      {done.length > 0 && (
        <section aria-label="지난 소모임 일정" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="morebtn" aria-expanded={showPast} aria-controls="club-past" onClick={() => setShowPast(!showPast)}>
            {showPast ? "지난 일정 접기 ▴" : `지난 일정 ${done.length}개 보기 ▾`}
          </button>
          {showPast && <ul id="club-past" style={ul}>{done.map(item)}</ul>}
        </section>
      )}
      {canCreate && creating && <EventCreate open={creating} onClose={() => setCreating(false)} unlocked={unlocked} fixedClub={club} />}
    </>
  );
}

/* ───── 소모임 화면: 맨 위 소모임 이름(오른쪽 끝 ‹ 소모임 목록) + 탭 4개 ───── */
function Club({ name, initialTab }: { name: string; initialTab: Tab }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/clubs/${encodeURIComponent(name)}`);
    if (!r.ok) return setError(r.error);
    setData(r.data);
  }, [name]);
  useEffect(() => {
    load();
  }, [load]);

  // 고른 탭을 주소에 남겨 새로 고침·뒤로 가기에도 그 탭으로
  function pick(t: Tab) {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === "overview") u.searchParams.delete("tab");
    else u.searchParams.set("tab", t);
    window.history.replaceState(null, "", u.toString());
  }

  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <h1 className="title grow" style={{ fontSize: fs(22), margin: 0, overflowWrap: "anywhere" }}>{data?.name ?? name}</h1>
        <Link href="/admin/clubs" className="mini" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", flex: "none" }}>‹ 소모임 목록</Link>
      </div>
      <div className="tabsx ctabs" role="tablist" aria-label={`${name} 관리`}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`ct-${t.key}`} aria-selected={tab === t.key} aria-controls={`cp-${t.key}`}
            className={tab === t.key ? "on" : ""} onClick={() => pick(t.key)}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`cp-${tab}`} aria-labelledby={`ct-${tab}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(tab === "overview" || tab === "members") && (data ? <Overview data={data} onSaved={load} part={tab === "overview" ? "info" : "members"} /> : error ? <div className="msg bad" role="alert">{error}</div> : <p className="small">불러오는 중이에요…</p>)}
        {tab === "dues" && <section className="card" aria-label="소모임 회비" style={{ display: "flex", flexDirection: "column", gap: 12 }}><ClubDuesEditor club={name} /></section>}
        {tab === "events" && <ClubEvents club={name} />}
        {tab === "requests" && <ClubRequestsAdmin club={name} />}
      </div>
    </>
  );
}

export default function ClubAdminPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { name } = use(params);
  const { tab } = use(searchParams);
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    /* 그대로 */
  }
  return <AdminGate mode="clubs" need={["members"]} active="/admin/clubs" hideSub><Club name={decoded} initialTab={isTab(tab) ? tab : "overview"} /></AdminGate>;
}
