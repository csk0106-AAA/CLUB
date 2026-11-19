"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EventHero } from "@/components/EventHero";
import { FeeDetail, feeSummary, Fold, NoticeText, noticeSummary, type FeeView } from "@/components/EventInfoCard";
import { LiveActivities } from "@/components/LiveActivities";
import { EventMinutes } from "@/components/EventMinutes";
import { EventPhotos } from "@/components/EventPhotos";
import { MemberTabs } from "@/components/MemberTabs";
import { MineInfo } from "@/components/MineInfo";
import { CarRequestBox } from "@/components/CarRequestBox";
import { ScheduleView, type SchedItem } from "@/components/ScheduleBoard";
import { Sheet } from "@/components/Sheet";
import { ClubRequestCard, type AttendReq, type JoinReq } from "./ClubRequestCard";
import { ObserversCard } from "./ObserversCard";
import { api, fmtDateDow, fmtDays, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Detail = {
  event: {
    id: string; type: string; name: string; startsAt: string; endsAt: string; place: string;
    coverUrl?: string; // 맨 위 사진(목록 카드와 같은 규칙)
    preview?: boolean; draft?: boolean; // 관리하는 사람이 공개 대상 밖·공개전 일정을 회원 화면으로 보는 중
    going?: number; // 참석 인원
    booking: string; fee: string; feePending?: boolean; feeDeadline: string; account: string; accountHolder: string;
    club?: string; clubLeaders?: { name: string; role: string }[]; observer?: boolean; canObserve?: boolean;
    canApply?: boolean; // false: 내가 속하지 않은 클럽 일정(읽기만)
    attendReq?: AttendReq; // 클럽 관리자에게 보낸 내 참석 요청(참관/가입 + 참석)
    clubJoin?: JoinReq; // 클럽 회원이 아닐 때 그 클럽 가입 신청(최근 것)
    guest?: boolean; // 대기회원·참관회원: 참석하려면 참관 신청(관리자 승인)
  };
  activities: { id: string; name: string }[];
  // 관리자가 회원에게 보이기를 켠 준비목록·비용(null = 안 보임)
  prep?: { id: string; item: string; owner: string; done: boolean }[] | null;
  prepFiles?: { id: string; name: string; size: number }[] | null;
  costs?: { id: string; item: string; budget: number; spent: number; status: string; owner: string }[] | null;
  apply: { answer: string; days: string[]; paid: boolean; payNotice: string; refund?: "" | "wait" | "done"; refundAmount?: string; refundDoneAt?: string } | null;
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
// 일정 기간의 날짜 목록 (최대 7일)
function eventDays(startsAt: string, endsAt: string): string[] {
  const from = startsAt.slice(0, 10);
  const to = (endsAt || startsAt).slice(0, 10);
  if (!from) return [];
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (d <= end && out.length < 7) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
// 일정·회비 관리 권한(지금 DB 기준)이 있으면 "일정 관리" 버튼
const canManageOf = (p?: string[]) => !!p && ["all", "events"].some((x) => p.includes(x));

// 일정 화면(한 페이지): 일정을 누르면 모두 여기로 온다(참석 여부를 알렸든 안 알렸든).
//  위: D-day · 회비 알림 · 일정 카드(유형·이름·일시·장소)
//  가운데: 주요 활동 · 내 참가비 · 안내 · 일정 — "펼쳐서 보기"로 여닫는다(관리자 개요의 "회원에게 보이는 모습"과 같은 조각)
//  아래: 참석 신청(참석 신청했어요 … 일정으로 돌아가기)
export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [schedule, setSchedule] = useState<SchedItem[]>([]);
  const [dayPlaces, setDayPlaces] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<string[]>([]);

  const load = useCallback(async () => {
    const m = await api<{ consent: boolean; livePerms?: string[] }>("/api/me");
    // 로그인 전에 일정 바로가기 링크로 들어왔으면, 로그인 뒤 이 일정으로 돌아오게 한다
    if (!m.ok) return void (m.status === 401 ? router.replace(`/?next=${encodeURIComponent(`/events/${id}`)}`) : setError(m.error));
    if (!m.data.consent) return void router.replace("/events");
    setManage(canManageOf(m.data.livePerms));
    const [r, mine] = await Promise.all([
      api<Detail>(`/api/events/${id}`),
      api<{ schedule: SchedItem[]; dayPlaces?: Record<string, string> }>(`/api/events/${id}/mine`),
    ]);
    if (!r.ok) return setError(r.error);
    setD(r.data);
    if (mine.ok) {
      setSchedule(mine.data.schedule);
      setDayPlaces(mine.data.dayPlaces ?? {});
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // 신청을 마친 뒤: 회비가 있으면 회비 안내, 없으면 이 화면 그대로
  const next = (fee: string) => {
    if (fee) router.push(`/events/${id}/fee`);
  };

  async function apply(answer: "참석" | "불참") {
    if (!d) return;
    // 회비 입금이 확인된 뒤 참석을 취소하면: 관리자가 회비를 돌려준다(송금대기 → 송금완료 알림). 먼저 알려 주고 묻는다
    if (answer === "불참" && d.apply?.answer === "참석" && d.apply.paid
      && !window.confirm(`회비 입금이 확인된 일정이에요.\n참석을 취소하면 관리자에게 알림이 가고, 관리자가 회비${d.event.fee ? ` ${Number(d.event.fee).toLocaleString("ko-KR")}원` : ""}을 송금해 드려요(송금하면 알림으로 알려 드려요).\n참석을 취소할까요?`)) return;
    // 송금대기 중 다시 참석: 회비를 돌려받지 않고 입금 확인 상태로 돌아간다
    if (answer === "참석" && d.apply?.refund === "wait"
      && !window.confirm("다시 참석하면 돌려받기로 한 회비는 송금하지 않고, 입금 확인 상태로 되돌려요.\n다시 참석할까요?")) return;
    setBusy(true);
    setError("");
    const r = await api(`/api/events/${id}/apply`, { body: { answer } });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    await load();
    setBusy(false);
    if (answer === "참석" && d.event.type === "워크숍") {
      setSel(d.apply?.days ?? []);
      setPicking(true);
    } else if (answer === "참석") {
      next(d.event.fee);
    }
  }

  async function saveDays() {
    setBusy(true);
    const r = await api(`/api/events/${id}/apply`, { body: { answer: "참석", days: sel } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPicking(false);
    // 참석 날짜에 따라 회비가 달라질 수 있으므로 날짜를 저장한 뒤의 내 회비로 다음 화면을 정한다.
    const fresh = await api<Detail>(`/api/events/${id}`);
    if (fresh.ok) setD(fresh.data);
    next(fresh.ok ? fresh.data.event.fee : d?.event.fee ?? "");
  }

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
  const answer = d.apply?.answer ?? "";
  const days = eventDays(e.startsAt, e.endsAt);
  const fee: FeeView = { kind: "member", fee: e.fee, feePending: e.feePending };
  const hasFee = !!e.fee || !!e.feePending;
  const actNames = d.activities.map((a) => a.name);
  // 참석인데 여러 날 일정(워크숍) 날짜를 아직 안 골랐으면(예: 클럽 관리자가 참석 요청을 승인한 직후) 날짜를 고르게 한다.
  const needDays = e.type === "워크숍" && answer === "참석" && e.canApply !== false && (d.apply?.days.length ?? 0) === 0 && days.length > 0;

  return (
    <main className="app with-tabs">
      {/* 맨 위 ★ D-day·참석 날짜 줄은 없앴다: D-day는 사진 카드(EventHero), 참석 날짜는 아래 "신청 완료 ✓" 안내에 보인다 */}

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
        {(manage || d?.event.preview) && <Link className="mini" href={`/admin/events/${id}${d?.event.club ? `?club=${encodeURIComponent(d.event.club)}` : ""}`} style={{ minHeight: 40 }}>일정 관리 ›</Link>}
      </div>
      {d?.event.preview && (
        <div className="msg info" role="status">
          아직 공개전인 일정이에요. 관리자라서 회원 화면 그대로 미리 보고 있어요. 참석 신청은 할 수 없어요. 고치려면 오른쪽 위 “일정 관리”를 눌러 주세요.
        </div>
      )}
      {error && <div className="msg bad" role="alert">{error}</div>}

      {/* 맨 위: 큰 사진(유형 라벨) · 제목 · 일시 · 장소(지도 고르기) */}
      <EventHero ev={e}>
        {e.observer && <div className="small">참관자로 초대받았어요.</div>}
      </EventHero>

      {/* 주요 활동: 펼치면 예전 일정 홈의 활동 길(함께할 활동)과 진행 중 카드. 일정 당일에는 처음부터 펼쳐 둔다. */}
      {actNames.length > 0 && (
        <Fold title="주요 활동" summary={actNames.join(" · ")} defaultOpen={dd === "오늘 진행"}>
          {/* 참석 신청 전에는 활동 내용만 보이고, 누르면 신청 안내(참석 신청자에게는 모두 열림) */}
          <div onClickCapture={(ev) => {
            if (answer === "참석" || !(ev.target as HTMLElement).closest("a,button")) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (e.canApply === false || e.preview) return void window.alert(e.preview ? "미리보기에서는 활동에 들어갈 수 없어요." : "이 클럽 회원·참관자만 활동에 참여할 수 있어요.");
            if (window.confirm("활동은 참석 신청한 회원만 참여할 수 있어요. 지금 참석 신청하러 갈까요?")) document.getElementById("apply")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}>
            {answer !== "참석" && <p className="small" style={{ margin: "0 0 8px" }}>참석 신청하면 활동에 참여할 수 있어요.</p>}
            <LiveActivities eventId={id} layout="path" />
          </div>
        </Fold>
      )}
      {hasFee && (
        <Fold title="내 참가비" summary={feeSummary(e, fee)}>
          <FeeDetail ev={e} fee={fee} />
          {d.apply?.paid && <div className="small" style={{ color: "var(--green-t)" }}>회비 입금 확인됨 ✓</div>}
          {d.feeDue && (
            <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minWidth: 180 }} onClick={() => router.push(`/events/${id}/fee`)}>
              {d.apply?.payNotice ? "입금 확인 기다리는 중 · 안내 보기" : "입금 안내 보기 · 입금 알리기"}
            </button>
          )}
        </Fold>
      )}
      {e.booking?.trim() && (
        <Fold title="안내" summary={noticeSummary(e.booking)}>
          <NoticeText text={e.booking.trim()} />
        </Fold>
      )}
      {schedule.length > 0 && (
        <Fold title="일정" summary={`세부 일정 ${schedule.length}개`}>
          <ScheduleView items={schedule} dayPlaces={dayPlaces} />
        </Fold>
      )}
      {/* 관리자가 "회원에게 보이기"를 켠 준비목록·비용(읽기만) */}
      {d.prep && (d.prep.length > 0 || (d.prepFiles?.length ?? 0) > 0) && (
        <Fold title="준비목록" summary={`${d.prep.filter((x) => x.done).length}/${d.prep.length} 준비됨${d.prepFiles?.length ? ` · 파일 ${d.prepFiles.length}개` : ""}`}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {d.prep.map((x) => (
              <li key={x.id} className="row" style={{ gap: 8 }}>
                <span aria-hidden="true" style={{ width: 20, textAlign: "center", color: x.done ? "var(--green-t)" : "var(--sub)" }}>{x.done ? "✓" : "○"}</span>
                <span className="grow" style={{ overflowWrap: "anywhere", textDecoration: x.done ? "line-through" : undefined, color: x.done ? "var(--sub)" : undefined }}>
                  {x.item}<span className="sr-only">{x.done ? " (준비됨)" : " (준비 전)"}</span>
                </span>
                {x.owner && <span className="small">담당 {x.owner}</span>}
              </li>
            ))}
          </ul>
          {d.prepFiles && d.prepFiles.length > 0 && (
            <ul aria-label="준비목록 파일" style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {d.prepFiles.map((f) => (
                <li key={f.id} className="row" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                  <span className="grow" style={{ minWidth: 0, overflowWrap: "anywhere" }}>📎 {f.name}
                    <span className="small" style={{ display: "block" }}>{f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(f.size / 1024))}KB`}</span>
                  </span>
                  <a className="mini" href={`/api/events/${d.event.id}/files/${f.id}`} download={f.name} style={{ textDecoration: "none" }} aria-label={`${f.name} 내려받기`}>내려받기</a>
                </li>
              ))}
            </ul>
          )}
        </Fold>
      )}
      {d.costs && d.costs.length > 0 && (
        <Fold title="비용" summary={`예산 ${won(d.costs.reduce((n, x) => n + x.budget, 0))} · 집행 ${won(d.costs.reduce((n, x) => n + x.spent, 0))}`}>
          <div className="tblw">
            <table className="tbl" style={{ minWidth: 0, width: "100%" }}>
              <thead><tr><th>항목</th><th style={{ textAlign: "right" }}>예산</th><th style={{ textAlign: "right" }}>집행</th></tr></thead>
              <tbody>
                {d.costs.map((x) => (
                  <tr key={x.id}>
                    <td style={{ overflowWrap: "anywhere" }}>{x.item}{x.owner && <span className="small" style={{ display: "block" }}>담당 {x.owner}</span>}</td>
                    <td className="num" style={{ textAlign: "right" }}>{won(x.budget)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{won(x.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Fold>
      )}

      {e.type === "회의" && <EventMinutes eventId={id} />}
      {/* 사진첩: 참석한 회원이 올리고 함께 본다(참석 대상이 아니면 그리지 않는다) */}
      <EventPhotos eventId={id} carousel />
      <MineInfo eventId={id} placeholder={answer !== "불참"} noSchedule />
      {/* 차량 신청: 관리자가 신청을 받거나 확정했을 때(참석 신청자만 신청할 수 있다) */}
      {!e.preview && <CarRequestBox eventId={id} />}
      {e.canObserve && <ObserversCard eventId={id} />}

      {/* 참석을 취소해서 회비를 돌려받는 중 / 돌려받음 */}
      {d.apply?.refund === "wait" && (
        <div className="msg info" role="status"><b>회비 송금 예정</b> · 일정에 참석하지 않아 회비 {Number(d.apply.refundAmount || 0).toLocaleString("ko-KR")}원을 관리자가 송금해 드릴 예정이에요.</div>
      )}
      {d.apply?.refund === "done" && (
        <div className="msg info" role="status"><b>회비 송금완료 ✓</b> · 회비 {Number(d.apply.refundAmount || 0).toLocaleString("ko-KR")}원을 송금해 드렸어요.</div>
      )}

      {/* 참석 신청(예전 일정 개요의 아래쪽 그대로) */}
      {answer === "참석" && e.canApply !== false && (
        <div className="msg info" role="status">
          <b>신청 완료 ✓</b>{d.apply && d.apply.days.length > 0 ? ` · ${fmtDays(d.apply.days)}` : ""}
          {d.apply?.paid ? " · 회비 입금 확인됨 ✓" : ""}
          {e.attendReq?.status === "approved" ? " · 클럽 관리자가 승인했어요" : ""}
        </div>
      )}
      {needDays && (
        <button className="fb bad" type="button" style={{ alignItems: "center" }} onClick={() => { setSel([]); setPicking(true); }}>
          <span className="ic" aria-hidden="true">!</span>
          <span className="grow"><b>참석 날짜를 골라 주세요</b><span className="t">날짜를 골라야 참가비가 정해져요 · 고르기 ›</span></span>
        </button>
      )}
      {answer === "불참" && e.canApply !== false && <div className="msg info">참석 안함으로 알렸어요. 마음이 바뀌면 언제든 바꿀 수 있어요.</div>}

      {e.canApply === false && !e.preview && (e.club || e.guest) ? (
        <>
          <ClubRequestCard eventId={id} club={e.club ?? ""} guest={e.guest} leaders={e.clubLeaders ?? []} req={e.attendReq ?? null} join={e.clubJoin ?? null} onChange={load} />
          <button className="btn white" type="button" onClick={() => router.push("/events")}>일정 목록으로</button>
        </>
      ) : !e.startsAt && answer === "" ? (
        <div className="footer-actions">
          <div className="fb info"><span className="ic" aria-hidden="true">i</span><div><b>날짜가 정해지면 알려 드려요</b><span className="t">일정이 확정되면 그때 참석 여부를 받을게요.</span></div></div>
          <button className="btn white" type="button" onClick={() => router.push("/events")}>일정 목록으로</button>
        </div>
      ) : (
        <div className="footer-actions" id="apply">
          {answer === "" && <p className="hint center">참석 여부를 알려 주세요. 나중에 바꿀 수 있어요. 참석 신청하면 활동·사진첩(올리기·좋아요·댓글)을 모두 쓸 수 있어요.</p>}
          {/* 신청 완료 · 참석 안함 · (워크숍) 참석 날짜 바꾸기를 한 줄에 */}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" type="button" disabled={busy || !!e.preview || answer === "참석"} onClick={() => apply("참석")}
              style={{ flex: "1 1 0", minWidth: 0, padding: "0 6px", fontSize: fs(15, 1.2), whiteSpace: "nowrap" }}>
              {answer === "참석" ? "신청 완료 ✓" : "참석 신청하기"}
            </button>
            <button className={`btn ${answer === "불참" ? "blue" : "white"}`} type="button" disabled={busy || !!e.preview || answer === "불참"} onClick={() => apply("불참")}
              style={{ flex: "1 1 0", minWidth: 0, padding: "0 6px", fontSize: fs(15, 1.2), whiteSpace: "nowrap" }}>
              참석 안함
            </button>
            {answer === "참석" && e.type === "워크숍" && (
              <button className="btn white" type="button" aria-label="참석 날짜 바꾸기" onClick={() => { setSel(d.apply?.days ?? []); setPicking(true); }}
                style={{ flex: "1 1 0", minWidth: 0, padding: "0 6px", fontSize: fs(15, 1.2), whiteSpace: "nowrap" }}>
                날짜 바꾸기
              </button>
            )}
          </div>
        </div>
      )}

      {picking && (
        <Sheet title="졸업여행 참석 날짜를 골라요" mascot>
          <p className="small" style={{ margin: 0 }}>1박 2일 참석하시면 두 날짜를 모두 눌러 주세요.</p>
          <div className="pick">
            {days.map((iso) => {
              const on = sel.includes(iso);
              return (
                <button key={iso} className="opt rowopt" type="button" aria-pressed={on}
                  onClick={() => setSel(on ? sel.filter((x) => x !== iso) : [...sel, iso])}>
                  <span className="name grow">{fmtDateDow(iso)}</span>
                  <span className="tick" />
                </button>
              );
            })}
          </div>
          <button className="btn" type="button" disabled={busy || sel.length === 0} onClick={saveDays}>확인</button>
        </Sheet>
      )}

      <MemberTabs on="events" />
    </main>
  );
}
