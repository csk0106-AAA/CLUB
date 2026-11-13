"use client";

import { useEffect, useState } from "react";
import { ScheduleView } from "./ScheduleBoard";
import { api, fmtDate, fmtDateTime } from "@/lib/client";

type Data = {
  schedule: { at: string; title: string }[];
  groups: { title: string; team: string; members: string[] }[];
  rooms: { published: boolean; mine: { date: string; name: string; memo: string; mates: string[] }[] };
  carpool: { published: boolean; mine: { dir: "go" | "back"; leg: string; name: string; plate: string; from: string; to: string; departAt: string; arriveAt: string; driver: string; iDrive: boolean; riders: string[]; seats: number }[] };
};

const when = (at: string) => fmtDateTime(at); // "2026/12/11 14:00"

// 회원이 보는 행사 정보: 일정, 내 조편성(배포된 것), 내 카풀(배포된 것)
// placeholder: 조편성·카풀이 아직 배포되지 않았을 때 "조 편성 후 알려 드려요" 카드를 보여 준다.
export function MineInfo({ eventId, placeholder = false }: { eventId: string; placeholder?: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await api<Data>(`/api/events/${eventId}/mine`);
      if (!stop && r.ok) setD(r.data);
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [eventId]);

  if (!d) return null;
  const nothingYet = d.groups.length === 0 && !(d.carpool.published && d.carpool.mine.length > 0);
  return (
    <>
      {placeholder && nothingYet && (
        <div className="card"><b style={{ font: "400 19px var(--display)" }}>내 조와 카풀</b><div className="small">조 편성 후 알려 드려요.</div></div>
      )}
      {d.schedule.length > 0 && (
        <section className="card" aria-label="일정">
          <b style={{ font: "400 19px var(--display)" }}>일정</b>
          {/* 날짜 제목 아래 시간순 */}
          <ScheduleView items={d.schedule} />
        </section>
      )}
      {d.groups.map((g, i) => (
        <section key={i} className="card" aria-label={`내 조 ${g.title}`}>
          <b style={{ font: "400 19px var(--display)" }}>{g.title}</b>
          <div><span className="pill blue">{g.team}</span></div>
          <div className="small">{g.members.join(", ")}</div>
        </section>
      ))}
      {d.rooms?.published && d.rooms.mine.length > 0 && (
        <section className="card" aria-label="내 숙소" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: "400 19px var(--display)" }}>내 숙소</b>
          {d.rooms.mine.map((r, i) => (
            <div key={i} style={{ borderTop: i ? "2px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
              <div className="row" style={{ flexWrap: "wrap" }}><span className="pill ok">{fmtDate(r.date)} 숙박</span><b>{r.name}</b></div>
              {r.memo && <div className="small">{r.memo}</div>}
              <div className="small">같은 방: {r.mates.length ? r.mates.join(", ") : "혼자 써요"}</div>
            </div>
          ))}
        </section>
      )}
      {d.carpool.published && d.carpool.mine.length > 0 && (
        <section className="card" aria-label="내 카풀" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: "400 19px var(--display)" }}>내 카풀</b>
          {/* 갈 때 / 올 때 구간별로 내가 탄(운전하는) 차 */}
          {d.carpool.mine.map((c, i) => (
            <div key={i} style={{ borderTop: i ? "2px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
              <div className="row" style={{ flexWrap: "wrap" }}><span className="pill ok">{c.leg}</span><b>{c.name}</b><span className="pill gray">{c.iDrive ? "내가 운전해요" : "탑승"}</span></div>
              <div>운전자: <b>{c.driver || "미정"}</b>{c.plate ? ` · 차량번호 ${c.plate}` : ""}</div>
              <div className="small">출발: {c.from || "장소 미정"}{c.departAt ? ` · ${when(c.departAt)}` : ""}</div>
              <div className="small">도착: {c.to || "장소 미정"}{c.arriveAt ? ` · ${when(c.arriveAt)} 예상` : ""}</div>
              <div className="small">동승자: {c.riders.length ? c.riders.join(", ") : "없음"}</div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
