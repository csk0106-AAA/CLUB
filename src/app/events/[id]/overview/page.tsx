"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MineInfo } from "@/components/MineInfo";
import { Sheet } from "@/components/Sheet";
import { api, fmtWhen, TYPE_TONE, won } from "@/lib/client";

type Detail = {
  event: {
    id: string; type: string; name: string; startsAt: string; endsAt: string; place: string;
    booking: string; fee: string; feePending?: boolean; feeDeadline: string; account: string; accountHolder: string;
  };
  activities: { id: string; name: string }[];
  apply: { answer: string; days: string[]; paid: boolean } | null;
  feeDue: boolean;
};

// 행사 기간의 날짜 목록 (최대 7일)
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
const dayLabel = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

// ③ 행사 개요: 행사를 누르면 먼저 보이는 화면. 참석 신청 → (워크숍) 날짜 선택 → 회비 안내 → 홈
export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<string[]>([]);

  const load = useCallback(async () => {
    const m = await api<{ consent: boolean }>("/api/me");
    if (!m.ok) return void (m.status === 401 ? router.replace("/") : setError(m.error));
    if (!m.data.consent) return void router.replace("/events");
    const r = await api<Detail>(`/api/events/${id}`);
    if (r.ok) setD(r.data);
    else setError(r.error);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // 신청을 마친 뒤 갈 곳: 회비가 있으면 회비 안내, 없으면 홈
  const next = (fee: string) => router.push(fee ? `/events/${id}/fee` : `/events/${id}`);

  async function apply(answer: "참석" | "불참") {
    if (!d) return;
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
    next(fresh.ok ? fresh.data.event.fee : d?.event.fee ?? "");
  }

  if (error && !d) {
    return (
      <main className="app">
        <div className="msg bad" role="alert">{error}</div>
        <button className="btn white" type="button" onClick={() => router.push("/events")}>‹ 행사 목록</button>
      </main>
    );
  }
  if (!d) return <main className="app"><p className="small">불러오는 중이에요…</p></main>;

  const e = d.event;
  const days = eventDays(e.startsAt, e.endsAt);
  const answer = d.apply?.answer ?? "";

  return (
    <main className="app">
      <div className="lh">
        <Link href={answer ? `/events/${id}` : "/events"} className="x" aria-label={answer ? "행사로 돌아가기" : "행사 목록으로"}>‹</Link>
        <span className={`pill ${TYPE_TONE[e.type] ?? "gray"}`}>{e.type}</span>
      </div>
      <h1 className="title">{e.name}</h1>
      {error && <div className="msg bad" role="alert">{error}</div>}

      <div className="card"><b>일시</b><div className="small">{e.startsAt ? fmtWhen(e.startsAt, e.endsAt, "").replace(/ · $/, "") : "날짜가 정해지면 알려 드려요"}</div></div>
      {e.place && <div className="card"><b>장소</b><div className="small">{e.place}</div></div>}
      {d.activities.length > 0 && (
        <div className="card"><b>주요 활동</b><div className="small">{d.activities.map((a) => a.name).join(" · ")}</div></div>
      )}
      {e.feePending && !e.fee && (
        <div className="card">
          <b>내 참가비</b>
          <div className="small">참석 날짜(1일 / 1박2일 등)에 따라 달라요. 참석 날짜를 고르면 내 회비를 알려 드려요.</div>
        </div>
      )}
      {e.fee && (
        <div className="card">
          <b>내 참가비</b>
          <div className="small">{won(e.fee)}{e.account ? ` · 계좌 ${e.account}${e.accountHolder ? ` (예금주 ${e.accountHolder})` : ""}` : ""}{e.feeDeadline ? ` · 입금 기한 ${e.feeDeadline}` : ""}</div>
        </div>
      )}
      {e.booking && <div className="card"><b>예약 안내</b><div className="small">{e.booking}</div></div>}
      <MineInfo eventId={id} placeholder />

      {answer === "참석" && (
        <div className="msg info">
          참석 신청했어요{d.apply && d.apply.days.length > 0 ? ` · ${d.apply.days.map(dayLabel).join(", ")}` : ""}
          {d.apply?.paid ? " · 회비 입금 확인됨 ✓" : ""}
        </div>
      )}
      {answer === "불참" && <div className="msg info">참석 안함으로 알렸어요. 마음이 바뀌면 언제든 바꿀 수 있어요.</div>}

      {!e.startsAt && answer === "" ? (
        <div className="footer-actions">
          <div className="fb info"><span className="ic" aria-hidden="true">i</span><div><b>날짜가 정해지면 알려 드려요</b><span className="t">일정이 확정되면 그때 참석 여부를 받을게요.</span></div></div>
          <button className="btn white" type="button" onClick={() => router.push("/events")}>행사 목록으로</button>
        </div>
      ) : (
      <div className="footer-actions">
        {answer === "" && <p className="hint center">참석 여부를 알려 주세요. 나중에 바꿀 수 있어요.</p>}
        <div className="row">
          <button className="btn" type="button" disabled={busy || answer === "참석"} onClick={() => apply("참석")}>
            {answer === "참석" ? "신청 완료 ✓" : "참석 신청하기"}
          </button>
          <button className={`btn ${answer === "불참" ? "blue" : "white"}`} type="button" disabled={busy || answer === "불참"} onClick={() => apply("불참")}>
            참석 안함
          </button>
        </div>
        {answer === "참석" && e.type === "워크숍" && (
          <button className="btn white" type="button" onClick={() => { setSel(d.apply?.days ?? []); setPicking(true); }}>참석 날짜 바꾸기</button>
        )}
        {answer !== "" && <button className="btn white" type="button" onClick={() => router.push(`/events/${id}`)}>행사로 돌아가기</button>}
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
                  <span className="name grow">{dayLabel(iso)}</span>
                  <span className="tick" />
                </button>
              );
            })}
          </div>
          <button className="btn" type="button" disabled={busy || sel.length === 0} onClick={saveDays}>확인</button>
        </Sheet>
      )}
    </main>
  );
}
