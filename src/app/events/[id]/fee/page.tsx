"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LessonHeader } from "@/components/LessonHeader";
import { api, fmtDate, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Detail = {
  event: { name: string; fee: string; feePending?: boolean; feeDeadline: string; account: string; accountHolder: string };
  apply: { answer: string; paid: boolean; payNotice: string; payUndoAt?: string; payUndoReason?: string; feeExtra?: number } | null;
  feeDue: boolean;
};

const md = (iso: string) => fmtDate(iso); // 입금 알림 시각(UTC) → 한국 날짜 "2026/11/14"

// ⑤ 회비 안내. 회원이 "입금했어요"를 누르면 관리자에게 먼저 알리고,
// 관리자가 입금을 확인하면 알림이 사라지고 '입금 확인됨'으로 바뀐다.
export default function FeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Detail>(`/api/events/${id}`);
    if (r.ok) setD(r.data);
    else if (r.status === 401) router.replace("/");
    else setError(r.error);
  }, [id, router]);
  // 화면으로 돌아올 때마다 다시 읽는다(관리자가 그사이 입금을 확인·취소했을 수 있다)
  useEffect(() => {
    load();
    const again = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => { document.removeEventListener("visibilitychange", again); window.removeEventListener("focus", again); };
  }, [load]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("복사하지 못했어요. 계좌번호를 길게 눌러 복사해 주세요.");
    }
  }

  async function notice(sent: boolean) {
    setBusy(true);
    setError("");
    const r = await api(`/api/events/${id}/pay-notice`, { body: { sent } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    load();
  }

  if (error && !d) return <main className="app"><div className="msg bad" role="alert">{error}</div></main>;
  if (!d) return <main className="app"><p className="small">불러오는 중이에요…</p></main>;

  const e = d.event;
  const attending = d.apply?.answer === "참석";
  // 입금 확인 뒤 참석 날짜·회비가 바뀌어 더 낼 돈(추가 입금)이 있으면 그 차액을 다시 알린다
  const extra = d.apply?.paid ? d.apply.feeExtra ?? 0 : 0;
  const paid = d.apply?.paid === true && extra <= 0;
  const noticed = !paid && Boolean(d.apply?.payNotice);

  return (
    <main className="app">
      <LessonHeader href={`/events/${id}`} closeLabel="일정으로 돌아가기" title="회비 안내"
        right={<span className={`chip ${paid ? "violet" : noticed ? "gray" : "red"}`}>{paid ? "입금 확인됨 ✓" : noticed ? "입금 확인 중" : extra > 0 ? "추가 입금 전" : "입금 확인 전"}</span>} />
      <p className="lead" style={{ marginBottom: -4 }}>{e.name}</p>

      {!attending && <div className="msg info">참석을 신청하면 회비 안내가 열려요.</div>}
      {attending && !e.fee && (e.feePending
        ? <div className="msg info">참석 날짜에 따라 회비가 달라요. 일정 개요에서 “참석 날짜 바꾸기”로 날짜를 고르면 내 회비를 알려 드려요.</div>
        : <div className="msg info">내 회비는 없어요. 따로 보내지 않아도 돼요.</div>)}

      {attending && e.fee && (
        <>
          {/* 설정 줄 모양(목업 C): 왼쪽 이름, 오른쪽 값 */}
          <section className="sect" aria-label="회비 정보">
            <div className="srow">
              <span className="k">내 회비</span>
              <b className="num" style={{ font: `700 ${fs(20)} var(--display)`, color: "var(--ink)" }}>{won(e.fee)}</b>
            </div>
            {extra > 0 && (
              <div className="srow">
                <span className="k">추가 입금</span>
                <b className="num" style={{ color: "var(--red-t)", fontSize: fs(16) }}>{won(String(extra))}</b>
              </div>
            )}
            <div className="srow" style={{ alignItems: "flex-start" }}>
              <span className="k" style={{ flex: "none", paddingTop: 2 }}>입금 계좌</span>
              <span className="v" style={{ flex: 1 }}>
                <b className="num" style={{ display: "block", color: "var(--ink)", fontSize: fs(15) }}>{e.account || "계좌가 정해지면 알려 드려요"}</b>
                <span style={{ fontSize: fs(12) }}>{e.accountHolder ? `예금주 ${e.accountHolder} · ` : ""}입금자명은 본인 이름으로 보내 주세요.</span>
              </span>
            </div>
            {e.feeDeadline && (
              <div className="srow">
                <span className="k">입금 기한</span>
                <b className="v num" style={{ color: "var(--ink)", fontSize: fs(14) }}>{fmtDate(e.feeDeadline)}까지</b>
              </div>
            )}
          </section>
          {paid ? (
            <div className="fb good"><span className="ic" aria-hidden="true">✓</span><div><b>입금이 확인됐어요</b><span className="t">회비 알림이 사라졌어요. 고맙습니다!</span></div></div>
          ) : noticed ? (
            <div className="fb info"><span className="ic" aria-hidden="true">i</span><div><b>입금 알림을 보냈어요</b><span className="t">{md(d.apply?.payNotice ?? "")}에 알렸어요. 관리자가 확인하면 회비 알림이 사라져요.</span></div></div>
          ) : extra > 0 && !d.apply?.payUndoAt ? (
            <div className="fb info"><span className="ic" aria-hidden="true">i</span><div><b>참석 날짜나 회비가 바뀌었어요</b><span className="t">추가 입금 {won(String(extra))}을 보낸 뒤 “입금했어요”를 눌러 주세요.</span></div></div>
          ) : d.apply?.payUndoAt ? (
            <div className="fb bad"><span className="ic" aria-hidden="true">!</span><div><b>입금이 확인되지 않았어요</b><span className="t">{md(d.apply.payUndoAt)}{d.apply.payUndoReason ? ` · 사유: ${d.apply.payUndoReason}` : ""}. 입금했다면 “입금했어요”를 다시 눌러 주세요.</span></div></div>
          ) : (
            <div className="fb info"><span className="ic" aria-hidden="true">i</span><div><b>입금한 뒤 “입금했어요”를 눌러 주세요</b><span className="t">관리자에게 알림이 가고, 확인이 끝나면 회비 알림이 사라져요.</span></div></div>
          )}
          {error && <div className="msg bad" role="alert">{error}</div>}
          <div className="footer-actions">
            {e.account && !paid && <button className="btn white" type="button" onClick={() => copy(e.account)}>{copied ? "복사했어요 ✓" : "계좌번호 복사"}</button>}
            {!paid && !noticed && <button className="btn" type="button" disabled={busy} onClick={() => notice(true)}>입금했어요</button>}
            {noticed && <button className="btn white" type="button" disabled={busy} onClick={() => notice(false)}>입금 알림 취소</button>}
            <button className="btn white" type="button" onClick={() => router.push(`/events/${id}`)}>일정으로 돌아가기</button>
          </div>
        </>
      )}
    </main>
  );
}
