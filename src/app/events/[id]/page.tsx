"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconStar } from "@/components/Icons";
import { LiveActivities } from "@/components/LiveActivities";
import { EventMinutes } from "@/components/EventMinutes";
import { MemberTabs } from "@/components/MemberTabs";
import { MineInfo } from "@/components/MineInfo";
import { clubLine, ObserversCard } from "./ObserversCard";
import { api, fmtDaySpan, fmtWhen, TYPE_TONE, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Detail = {
  event: {
    id: string; type: string; name: string; startsAt: string; endsAt: string; place: string;
    fee: string;
    club?: string; clubLeaders?: { name: string; role: string }[]; canObserve?: boolean;
  };
  apply: { answer: string; days: string[]; paid: boolean; payNotice: string } | null;
  feeDue: boolean;
};

// 일정 시작까지 남은 날: "D-35", 진행 중이면 "오늘 진행", 끝났으면 빈 문자열
function dday(startsAt: string, endsAt: string): string {
  if (!startsAt) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${startsAt.slice(0, 10)}T00:00:00`);
  const end = new Date(`${(endsAt || startsAt).slice(0, 10)}T00:00:00`);
  const diff = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  if (diff > 0) return `D-${diff}`;
  if (today <= end) return "오늘 진행";
  return "";
}
const days = (list: string[]) => fmtDaySpan(list);
// 일정·회비 관리 권한(지금 DB 기준)이 있으면 "일정 관리" 버튼
const canManageOf = (p?: string[]) => !!p && ["all", "events", "fees"].some((x) => p.includes(x));

// ⑥ 일정 홈: D-day, 회비 알림, 활동 길
export default function EventHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [manage, setManage] = useState(false);

  const load = useCallback(async () => {
    const m = await api<{ consent: boolean; livePerms?: string[] }>("/api/me");
    if (!m.ok) return void (m.status === 401 ? router.replace("/") : setError(m.error));
    if (!m.data.consent) return void router.replace("/events");
    setManage(canManageOf(m.data.livePerms));
    const r = await api<Detail>(`/api/events/${id}`);
    if (!r.ok) return setError(r.error);
    // 참석 여부를 아직 안 알렸으면 개요부터 보여 준다.
    if (!r.data.apply || r.data.apply.answer === "") return void router.replace(`/events/${id}/overview`);
    setD(r.data);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !d) {
    return (
      <main className="app with-tabs">
        <div className="msg bad" role="alert">{error}</div>
        <button className="btn white" type="button" onClick={() => router.push("/events")}>‹ 일정 목록</button>
        <MemberTabs on="events" />
      </main>
    );
  }
  if (!d) return <main className="app with-tabs"><p className="small">불러오는 중이에요…</p><MemberTabs on="events" /></main>;

  const e = d.event;
  const dd = dday(e.startsAt, e.endsAt);
  const tripDays = e.type === "워크숍" && d.apply?.answer === "참석" ? days(d.apply.days) : "";

  return (
    <main className="app with-tabs">
      {(dd || tripDays) && (
        <div className="stats">
          {dd ? <span className="stat"><span style={{ color: "var(--red)", display: "inline-flex" }}><IconStar size={18} /></span>{dd}</span> : <span />}
          {tripDays && <span className="pill warn">졸업여행 참석자 · {tripDays}</span>}
        </div>
      )}

      {d.feeDue && (
        d.apply?.payNotice ? (
          <button className="fb info" type="button" style={{ alignItems: "center" }} onClick={() => router.push(`/events/${id}/fee`)}>
            <span className="ic" style={{ fontSize: fs(15) }} aria-hidden="true">₩</span>
            <span className="grow"><b>입금 확인을 기다리고 있어요</b><span className="t">{won(e.fee)} · 안내 보기 ›</span></span>
          </button>
        ) : (
          <button className="fb bad" type="button" style={{ alignItems: "center" }} onClick={() => router.push(`/events/${id}/fee`)}>
            <span className="ic" style={{ fontSize: fs(15) }} aria-hidden="true">₩</span>
            <span className="grow"><b>회비를 아직 안 내셨어요</b><span className="t">{won(e.fee)} · 안내 보기 ›</span></span>
          </button>
        )
      )}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link href="/events" className="small" style={{ fontWeight: 700, color: "var(--blue-t)", textDecoration: "none", minHeight: 32, display: "inline-flex", alignItems: "center" }}>‹ 일정 목록으로</Link>
        {manage && <Link className="mini" href={`/admin/events/${id}`} style={{ minHeight: 40 }}>일정 관리</Link>}
      </div>

      <Link href={`/events/${id}/overview`} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
        <div>
          <span className={`pill ${TYPE_TONE[e.type] ?? "gray"}`}>{e.type}</span>
          <b style={{ display: "block", font: `700 ${fs(17)} var(--display)` }}>{e.name}</b>
          <div className="small">{fmtWhen(e.startsAt, e.endsAt, e.place)}</div>
          {e.club && <div className="small">소모임: {clubLine(e.club, e.clubLeaders)}</div>}
        </div>
        <span className="small" style={{ fontWeight: 700, color: "var(--blue-t)", whiteSpace: "nowrap" }}>일정 개요 ›</span>
      </Link>
      {d.apply?.answer === "불참" && <div className="msg info">참석 안함으로 알렸어요. 일정 개요에서 언제든 바꿀 수 있어요.</div>}

      {e.type === "회의" && <EventMinutes eventId={id} />}
      <LiveActivities eventId={id} layout="path" />
      <MineInfo eventId={id} />
      {e.canObserve && <ObserversCard eventId={id} />}

      <MemberTabs on="events" />
    </main>
  );
}
