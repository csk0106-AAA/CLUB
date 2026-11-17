"use client";

import { useEffect, useState } from "react";
import { ScheduleView, type SchedItem } from "./ScheduleBoard";
import { Fold } from "./EventInfoCard";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type Data = {
  schedule: SchedItem[];
  dayPlaces?: Record<string, string>;
  groups: { title: string; team: string; members: string[]; teams?: { name: string; members: string[]; mine: boolean }[] }[];
  groupsPending?: number;
  rooms: { published: boolean; mine: { date: string; name: string; memo: string; mates: string[]; people?: string[] }[] };
  carpool: { published: boolean; mine: { dir: "go" | "back"; leg: string; name: string; plate: string; from: string; to: string; departAt: string; arriveAt: string; driver: string; iDrive: boolean; riders: string[]; seats: number; people?: string[] }[] };
};

const when = (at: string) => fmtDateTime(at); // "2026/12/11 14:00"

// 같은 조·차·방 명단: "조원 5명" + 이름 칩(나는 파란색)
function People({ label, names }: { label: string; names: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="small">{label} {names.length}명</span>
      <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
        {names.map((n, i) => <span key={i} className={`pill ${n.includes("(나)") ? "blue" : "gray"}`}>{n}</span>)}
      </div>
    </div>
  );
}

// 회원이 보는 일정 정보: 일정, 내 조편성(배포된 것), 내 카풀(배포된 것)
// placeholder: 조편성·카풀이 아직 배포되지 않았을 때 "조 편성 후 알려 드려요" 카드를 보여 준다.
// noSchedule: 일정 칸은 빼고 그린다(일정 화면은 일정을 "펼쳐서 보기" 칸으로 따로 보여 준다).
export function MineInfo({ eventId, placeholder = false, noSchedule = false }: { eventId: string; placeholder?: boolean; noSchedule?: boolean }) {
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
  const head = (t: string) => <b style={{ font: `700 ${fs(17)} var(--display)` }}>{t}</b>;
  // 아직 배정 전인 칸: 참석 회원(placeholder)에게만 "배정 전" 안내를 보여 준다
  const waitCard = (title: string, text: string) =>
    placeholder ? <section className="card" aria-label={title}>{head(title)}<div className="small">{text}</div></section> : null;
  return (
    <>
      {d.groups.length === 0 && waitCard("조편성", (d.groupsPending ?? 0) > 0 ? "조편성을 준비하고 있어요. 확정되면 여기에 보여요." : "조 편성 전이에요. 정해지면 여기에 보여요.")}
      {/* 조편성: 한 줄 요약(내 조 2팀 · 조원 5명), 조원 명단·전체 조는 펼쳐서 보기 */}
      {d.groups.map((g, i) => (
        <Fold key={i} title={`조편성 · ${g.title}`}
          summary={g.team ? `내 조 ${g.team} · 조원 ${g.members.length}명` : `내가 들어간 조는 없어요 · 전체 ${g.teams?.length ?? 0}개 조`}>
          {/* 펼쳐도 요약 한 줄은 그대로(조원 명단은 아래 전체 조에서 내 조로 확인) */}
          {g.team && (
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <span className="small">내 조</span><span className="pill blue">{g.team}</span><span className="small">· 조원 {g.members.length}명</span>
            </div>
          )}
          {(g.teams?.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: g.team ? "1px solid var(--line)" : undefined, paddingTop: g.team ? 8 : 0 }}>
              <span className="small">전체 조 ({g.teams!.length}개 조)</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {g.teams!.map((t, j) => (
                  <div key={j} style={{ borderTop: j ? "1px solid var(--line)" : undefined, paddingTop: j ? 6 : 0 }}>
                    <span className={`pill ${t.mine ? "blue" : "gray"}`}>{t.name}</span>{" "}
                    <span className="small">
                      {t.members.length}명 ·{" "}
                      {t.members.map((n, k) => (
                        <span key={k}>
                          {k > 0 && ", "}
                          {n.includes("(나)") ? <b style={{ color: "var(--violet-t)" }}>{n}</b> : n}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Fold>
      ))}
      {!d.carpool.published && waitCard("카풀", "카풀 배정 전이에요. 정해지면 여기에 보여요.")}
      {d.carpool.published && d.carpool.mine.length === 0 && waitCard("카풀", "배정된 카풀이 없어요.")}
      {!d.rooms?.published && waitCard("방 배정", "방 배정 전이에요. 정해지면 여기에 보여요.")}
      {d.rooms?.published && d.rooms.mine.length === 0 && waitCard("방 배정", "배정된 방이 없어요.")}
      {!noSchedule && d.schedule.length > 0 && (
        <section className="card" aria-label="일정">
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>일정</b>
          {/* 날짜 제목 아래 시간순 */}
          <ScheduleView items={d.schedule} dayPlaces={d.dayPlaces} />
        </section>
      )}
      {/* 방 배정: 한 줄 요약(날짜 방이름 · 같은 방 N명), 메모·명단은 펼쳐서 보기 */}
      {d.rooms?.published && d.rooms.mine.length > 0 && (
        <Fold title="방 배정" summary={d.rooms.mine.map((r) => `${fmtDate(r.date)} ${r.name} · 같은 방 ${r.people?.length ?? r.mates.length + 1}명`).join(" / ")}>
          {d.rooms.mine.map((r, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
              <div className="row" style={{ flexWrap: "wrap" }}><span className="pill ok">{fmtDate(r.date)} 숙박</span><b>{r.name}</b></div>
              {r.memo && <div className="small">{r.memo}</div>}
              {r.people ? <People label="같은 방" names={r.people} /> : <div className="small">같은 방: {r.mates.length ? r.mates.join(", ") : "혼자 써요"}</div>}
            </div>
          ))}
        </Fold>
      )}
      {/* 카풀: 한 줄 요약(갈 때 차 이름 · 운전/탑승 · 출발 시각), 장소·명단은 펼쳐서 보기 */}
      {d.carpool.published && d.carpool.mine.length > 0 && (
        <Fold title="카풀" summary={d.carpool.mine.map((c) => `${c.leg} ${c.name}${c.iDrive ? " · 내가 운전" : c.driver ? ` · 운전 ${c.driver}` : ""}${c.departAt ? ` · ${when(c.departAt)} 출발` : ""}`).join(" / ")}>
          {/* 갈 때 / 올 때 구간별로 내가 탄(운전하는) 차 */}
          {d.carpool.mine.map((c, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
              <div className="row" style={{ flexWrap: "wrap" }}><span className="pill ok">{c.leg}</span><b>{c.name}</b><span className="pill gray">{c.iDrive ? "내가 운전해요" : "탑승"}</span></div>
              <div>운전자: <b>{c.driver || "미정"}</b>{c.plate ? ` · 차량번호 ${c.plate}` : ""}</div>
              <div className="small">출발: {c.from || "장소 미정"}{c.departAt ? ` · ${when(c.departAt)}` : ""}</div>
              <div className="small">도착: {c.to || "장소 미정"}{c.arriveAt ? ` · ${when(c.arriveAt)} 예상` : ""}</div>
              {c.people ? <People label="같은 차" names={c.people} /> : <div className="small">동승자: {c.riders.length ? c.riders.join(", ") : "없음"}</div>}
            </div>
          ))}
        </Fold>
      )}
    </>
  );
}
