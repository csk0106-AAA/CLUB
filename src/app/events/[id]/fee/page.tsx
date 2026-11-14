"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LessonHeader } from "@/components/LessonHeader";
import { api, fmtDate, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Detail = {
  event: { name: string; fee: string; feePending?: boolean; feeDeadline: string; account: string; accountHolder: string };
  apply: { answer: string; paid: boolean; payNotice: string } | null;
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
  useEffect(() => {
    load();
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
  const paid = d.apply?.paid === true;
  const noticed = !paid && Boolean(d.apply?.payNotice);

  return (
    <main className="app">
      <LessonHeader href={`/events/${id}`} closeLabel="일정으로 돌아가기"
        right={<span className={`pill ${paid ? "ok" : noticed ? "warn" : "bad"}`}>{paid ? "입금 확인됨 ✓" : noticed ? "입금 확인 중" : "입금 확인 전"}</span>} />
      <h1 className="title">회비를 보내 주세요</h1>

      {!attending && <div className="msg info">참석을 신청하면 회비 안내가 열려요.</div>}
      {attending && !e.fee && (e.feePending
        ? <div className="msg info">참석 날짜에 따라 회비가 달라요. 일정 개요에서 “참석 날짜 바꾸기”로 날짜를 고르면 내 회비를 알려 드려요.</div>
        : <div className="msg info">내 회비는 없어요. 따로 보내지 않아도 돼요.</div>)}

      {attending && e.fee && (
        <>
          <div className="card center"><span className="small">내 회비</span><div className="title num" style={{ fontSize: fs(40) }}>{won(e.fee)}</div></div>
          <div className="card">
            <span className="small">입금 계좌</span>
            <div className="num" style={{ font: `700 ${fs(19)} var(--body)` }}>{e.account || "계좌가 정해지면 알려 드려요"}</div>
            <div className="small">{e.accountHolder ? `예금주 ${e.accountHolder} · ` : ""}입금자명은 본인 이름으로 보내 주세요.</div>
          </div>
          {e.feeDeadline && <div className="card"><span className="small">입금 기한</span><div style={{ font: `700 ${fs(19)} var(--body)` }}>{fmtDate(e.feeDeadline)}까지</div></div>}
          {paid ? (
            <div className="fb good"><span className="ic" aria-hidden="true">✓</span><div><b>입금이 확인됐어요</b><span className="t">회비 알림이 사라졌어요. 고맙습니다!</span></div></div>
          ) : noticed ? (
            <div className="fb info"><span className="ic" aria-hidden="true">i</span><div><b>입금 알림을 보냈어요</b><span className="t">{md(d.apply?.payNotice ?? "")}에 알렸어요. 관리자가 확인하면 회비 알림이 사라져요.</span></div></div>
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
