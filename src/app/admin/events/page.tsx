"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { EventCreate } from "@/components/EventCreate";
import { EventRowActions } from "@/components/EventRowActions";
import { IconPin } from "@/components/Icons";
import { api, fmtWhen, TYPE_TONE } from "@/lib/client";
import { fs } from "@/lib/fs";

type Ev = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string;
  published: string; pinned?: string; club?: string; status?: string; canDelete?: boolean;
  total: number; attend: number; absent: number; paid: number;
};

// 한국 시간 오늘 "YYYY-MM-DD"
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
// 끝나는 날(없으면 시작 날)이 오늘보다 앞이면 지난 일정. 날짜가 없으면 예정(날짜 미정)으로 둔다.
const isPast = (e: Ev, today: string) => {
  const d = (e.endsAt || e.startsAt || "").slice(0, 10);
  return !!d && d < today;
};
const TYPE_CHIP: Record<string, string> = { red: "red", violet: "violet", warn: "warn", ink: "ink", gray: "line" };

// 관리자 › 일정관리: "+ 일정 만들기"와 만든 일정(초안·공개). 누르면 그 일정의 관리 화면으로.
// 클럽 일정은 여기서 만들거나 보여 주지 않는다(클럽관리 › 클럽 › 클럽일정관리에서).
function EventsAdmin() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [msg, setMsg] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ perms: string[]; admin: boolean }>("/api/me").then((r) => {
      if (!r.ok) return;
      setCanCreate(r.data.perms.includes("all") || r.data.perms.includes("events"));
      setUnlocked(r.data.admin);
    });
    api<{ events: Ev[] }>("/api/admin/events").then((r) => {
      if (!r.ok) return setMsg(r.error);
      setEvents(r.data.events.filter((e) => !e.club));
    });
  }, []);

  const today = todayKst();
  const word = q.trim().toLowerCase();
  const match = (e: Ev) => !word || [e.name, e.type, e.place].some((x) => x.toLowerCase().includes(word));
  const list = (events ?? []).filter(match);
  const key = (e: Ev) => e.startsAt || "9999";
  // 예정: 고정 → 가까운 날짜부터(날짜 미정은 맨 뒤) / 지난: 최근 것부터
  const upcoming = list.filter((e) => !isPast(e, today)).sort((a, b) => Number(b.pinned === "true") - Number(a.pinned === "true") || key(a).localeCompare(key(b)));
  const past = list.filter((e) => isPast(e, today)).sort((a, b) => key(b).localeCompare(key(a)));
  const drafts = (events ?? []).filter((e) => e.published !== "true").length;

  const item = (e: Ev) => {
    const pub = e.published === "true";
    return (
      <li key={e.id} className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Link href={`/admin/events/${e.id}`} aria-label={`${e.name} 일정 관리`}
          style={{ display: "flex", flexDirection: "column", gap: 6, color: "inherit", textDecoration: "none", flex: 1, minWidth: 0 }}>
          <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {e.pinned === "true" && <span className="chip red"><IconPin size={12} />고정</span>}
            <span className={`chip ${TYPE_CHIP[TYPE_TONE[e.type] ?? "gray"] ?? "line"}`}>{e.club ? `${e.type} · ${e.club}` : e.type}</span>
            <span className={`chip ${pub ? "violet" : "gray"}`}>{pub ? "공개" : "초안"}</span>
            {/* 클럽 유형인데 클럽이 비어 있으면(예전에 만든 일정) 열어서 클럽을 골라 주면 그 클럽 화면으로 옮겨 간다 */}
            {e.type === "클럽" && !e.club && <span className="chip red">클럽 미지정 · 눌러서 클럽 고르기</span>}
          </span>
          <b style={{ font: `700 ${fs(17)} var(--display)`, overflowWrap: "anywhere" }}>{e.name}</b>
          <span className="small">{fmtWhen(e.startsAt, e.endsAt, e.place) || "일시·장소를 아직 정하지 않았어요"}</span>
          {pub && (
            <span className="small">
              참석 {e.attend} · 불참 {e.absent} · 미응답 {Math.max(0, e.total - e.attend - e.absent)}
              {e.attend > 0 ? ` · 입금 ${e.paid}/${e.attend}` : ""}
            </span>
          )}
        </Link>
        <EventRowActions ev={e} href={`/admin/events/${e.id}`}
          onDeleted={(id) => setEvents((l) => (l ?? []).filter((x) => x.id !== id))}
          onUnpublished={(id) => setEvents((l) => (l ?? []).map((x) => (x.id === id ? { ...x, published: "false", status: "초안" } : x)))} />
      </li>
    );
  };
  const ul = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } as const;

  return (
    <>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <h1 className="title grow" style={{ fontSize: fs(20) }}>일정관리</h1>
        {canCreate && (
          <button type="button" className="btn" style={{ width: "auto", minWidth: 160 }} aria-haspopup="dialog" onClick={() => setCreating(true)}>+ 일정 만들기</button>
        )}
      </div>
      <p className="small" style={{ margin: 0 }}>
        만든 일정이 모두 보여요{drafts ? ` (초안 ${drafts}개는 아직 회원에게 안 보여요)` : ""}. 일정을 누르면 관리 화면에서 개요·참석 신청·회비·활동 등을 다뤄요. 클럽 일정은 클럽관리에서 만들고 관리해요.
        {!canCreate && " 새 일정은 일정관리 권한이 있는 관리자가 만들어요."}
      </p>
      {msg && <div className="msg bad" role="alert">{msg}</div>}
      {!events && !msg && <p className="small">불러오는 중이에요…</p>}

      {events && events.length > 0 && (
        <div>
          <label className="l" htmlFor="ev-q">일정 찾기</label>
          <input id="ev-q" className="field" type="search" placeholder="이름, 유형, 장소" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {events && events.length === 0 && <div className="msg info">아직 만든 일정이 없어요. “+ 일정 만들기”로 시작해 보세요.</div>}
      {events && events.length > 0 && list.length === 0 && <div className="msg info">“{q}”에 맞는 일정이 없어요.</div>}

      {upcoming.length > 0 && (
        <section aria-label="예정된 일정" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>예정 {upcoming.length}개</b>
          <ul style={ul}>{upcoming.map(item)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-label="지난 일정" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {word ? (
            <b style={{ font: `700 ${fs(16)} var(--display)` }}>지난 일정 {past.length}개</b>
          ) : (
            <button type="button" className="morebtn" aria-expanded={showPast} aria-controls="admin-past" onClick={() => setShowPast(!showPast)}>
              {showPast ? "지난 일정 접기 ▴" : `지난 일정 ${past.length}개 보기 ▾`}
            </button>
          )}
          {(showPast || !!word) && <ul id="admin-past" style={ul}>{past.map(item)}</ul>}
        </section>
      )}

      {canCreate && creating && <EventCreate open={creating} onClose={() => setCreating(false)} unlocked={unlocked} />}
    </>
  );
}

export default function EventsAdminPage() {
  return <AdminGate mode="events" need={["events"]} active="/admin/events"><EventsAdmin /></AdminGate>;
}
