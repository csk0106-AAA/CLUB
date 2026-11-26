"use client";

import { useEffect, useState } from "react";
import { ScheduleView, type SchedItem } from "./ScheduleBoard";
import { Fold } from "./EventInfoCard";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type Data = {
  schedule: SchedItem[];
  dayPlaces?: Record<string, string>;
  // titles: 같은 구성을 쓰는 곳(일정 조편성·활동). 구성이 같으면 한 칸으로 합쳐 온다
  groups: { title: string; titles?: string[]; team: string; members: string[]; teams?: { name: string; members: string[]; mine: boolean }[] }[];
  groupsPending?: number;
  // 미응답·불참이라 닫힌 항목 중 이 일정에 실제로 있는 것(groups·rooms·cars) → 잠긴 칸으로 보여 준다
  lockedCards?: string[];
  // 이 일정이 조편성·숙소 배정을 쓰는지(쓰지 않으면 "배정 전" 안내 칸을 그리지 않는다)
  usesGroups?: boolean;
  usesRooms?: boolean;
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
// lockedCard: 미응답·불참에게 닫힌 항목을 그릴 잠긴 칸(회원 일정 화면이 넘겨준다)
export function MineInfo({ eventId, placeholder = false, noSchedule = false, lockedCard }: { eventId: string; placeholder?: boolean; noSchedule?: boolean; lockedCard?: (title: string) => React.ReactNode }) {
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
  const lockedSet = new Set(d.lockedCards ?? []);
  const LOCK_TITLE: Record<string, string> = { groups: "조편성", rooms: "숙소 배정", cars: "차량 배정" };
  return (
    <>
      {lockedCard && [...lockedSet].map((k) => <span key={k} style={{ display: "contents" }}>{lockedCard(LOCK_TITLE[k] ?? k)}</span>)}
      {!lockedSet.has("groups") && d.usesGroups && d.groups.length === 0 && waitCard("조편성", (d.groupsPending ?? 0) > 0 ? "조편성을 준비하고 있어요. 확정되면 여기에 보여요." : "조 편성 전이에요. 정해지면 여기에 보여요.")}
      {/* 조편성: 한 줄 요약(내 조 2팀 · 조원 5명), 조원 명단·전체 조는 펼쳐서 보기 */}
      {d.groups.map((g, i) => (
        <Fold key={i} title={`조편성 · ${g.titles?.[0] ?? g.title}`}
          summary={`${g.team ? `내 조 ${g.team} · 조원 ${g.members.length}명` : `내가 들어간 조는 없어요 · 전체 ${g.teams?.length ?? 0}개 조`}${(g.titles?.length ?? 1) > 1 ? ` · ${g.titles!.slice(1).join(", ")}도 같은 조` : ""}`}>
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
      {!lockedSet.has("rooms") && d.usesRooms && !d.rooms?.published && waitCard("숙소 배정", "숙소 배정 전이에요. 정해지면 여기에 보여요.")}
      {!lockedSet.has("rooms") && d.usesRooms && d.rooms?.published && d.rooms.mine.length === 0 && waitCard("숙소 배정", "배정된 방이 없어요.")}
      {!noSchedule && d.schedule.length > 0 && (
        <section className="card" aria-label="일정">
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>일정</b>
          {/* 날짜 제목 아래 시간순 */}
          <ScheduleView items={d.schedule} dayPlaces={d.dayPlaces} />
        </section>
      )}
      {/* 숙소 배정: 한 줄 요약(날짜 방이름 · 같은 방 N명), 메모·명단은 펼쳐서 보기 */}
      {d.rooms?.published && d.rooms.mine.length > 0 && (
        <Fold title="숙소 배정" summary={d.rooms.mine.map((r) => `${fmtDate(r.date)} ${r.name} · 같은 방 ${r.people?.length ?? r.mates.length + 1}명`).join(" / ")}>
          {d.rooms.mine.map((r, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
              <div className="row" style={{ flexWrap: "wrap" }}><span className="pill ok">{fmtDate(r.date)} 숙박</span><b>{r.name}</b></div>
              {r.memo && <div className="small">{r.memo}</div>}
              {r.people ? <People label="같은 방" names={r.people} /> : <div className="small">같은 방: {r.mates.length ? r.mates.join(", ") : "혼자 써요"}</div>}
            </div>
          ))}
        </Fold>
      )}
      {/* 차량배정(내 차)은 일정 화면의 "차량배정" 칸(components/CarRequestBox.tsx)이 보여 준다 */}
    </>
  );
}
