"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client";
import { FreshChip } from "./FreshChip";
import { refreshUnread } from "./MemberTabs";
import { fs } from "@/lib/fs";

type Handle = {
  id: string; kind: string; kindLabel: string; attend?: boolean; club: string; eventId: string; eventName: string;
  memberName: string; message: string; createdAt: string;
};
type Mine = {
  id: string; kind: string; kindLabel: string; club: string; eventId: string; eventName: string;
  status: string; createdAt: string; handledAt: string; handledByName: string; unseen: boolean; reason?: string;
};
type CommentAlert = { id: string; postId: string; title: string; name: string; at: string };
export type AlertsData = {
  posts: { id: string; title: string; at: string; fresh: "new" | "updated" }[]; toHandle: Handle[]; mine: Mine[];
  comments: CommentAlert[]; count: number;
  memberApps?: number; // 승인 전 회원 신청(관리자에게만)
  // 확인 전 입금 알림(회원이 "입금했어요"를 누름) — 그 일정을 관리하는 사람에게만
  payNotices?: { id: string; eventId: string; eventName: string; club: string; memberName: string; at: string }[];
  // 모임 회비 입금 알림(회비를 관리하는 관리자에게만)
  duesNotices?: { id: string; period: string; periodLabel: string; memberName: string; at: string }[];
};

const STATUS: Record<string, { text: string; tone: string }> = {
  pending: { text: "확인 기다리는 중", tone: "warn" },
  approved: { text: "승인됨", tone: "ok" },
  declined: { text: "반려됨", tone: "bad" },
};
const sectionTitle = { font: `700 ${fs(16)} var(--display)`, margin: 0 } as const;
const what = (r: { kindLabel: string; club: string; eventName: string }) =>
  `${r.club ? `${r.club} ` : ""}${r.kindLabel}${r.eventName ? ` · ${r.eventName}` : ""}`;

// 홈 화면 종 아이콘을 누르면 뜨는 알림 목록.
// 열면(불러온 뒤) 새 글, 내 글에 달린 댓글, 내 신청 결과를 "봤음"으로 표시한다. 처리할 신청은 승인·거절해야 숫자에서 빠진다.
export function AlertsPanel({ onCount }: { onCount: (n: number) => void }) {
  const [d, setD] = useState<AlertsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async (markSeen: boolean) => {
    const r = await api<AlertsData>("/api/alerts");
    if (!r.ok) return setError(r.error);
    setD(r.data);
    if (markSeen) {
      const s = await api<{ count: number }>("/api/alerts", { body: { seen: true } });
      if (s.ok) onCount(s.data.count);
      refreshUnread();
    }
  }, [onCount]);
  useEffect(() => {
    load(true);
  }, [load]);

  // 내가 보낸 신청 중 아직 처리되지 않은 것을 취소한다(신청이 지워진다)
  async function cancelMine(m: Mine) {
    if (!window.confirm(`${what(m)}을 취소할까요?`)) return;
    setBusy(m.id);
    setNote("");
    const r = await api(`/api/club-requests/${m.id}`, { method: "DELETE" });
    setBusy("");
    if (!r.ok) return setError(r.error);
    setNote("신청을 취소했어요.");
    await load(false);
  }

  async function decide(h: Handle, decision: "approve" | "decline") {
    // 반려는 사유를 적는다(비워도 됨, 취소를 누르면 반려하지 않음). 사유는 신청한 회원에게 보인다.
    let reason = "";
    if (decision === "decline") {
      const v = window.prompt(`${h.memberName} 님의 ${h.kindLabel}을 반려할까요? 반려 사유를 적어 주세요(선택).`, "");
      if (v === null) return;
      reason = v.trim().slice(0, 300);
    }
    setBusy(h.id);
    setNote("");
    const r = await api(`/api/club-requests/${h.id}`, { method: "PATCH", body: { decision, reason } });
    setBusy("");
    if (!r.ok) return setError(r.error);
    setNote(decision === "approve"
      ? `${h.memberName} 님의 ${h.kindLabel}을 승인했어요.${h.kind === "join" ? ` 이제 ${h.club} 회원이에요.` : ""}${h.attend ? " 이 일정에 참석 신청까지 됐어요." : h.kind === "join" ? "" : " 이제 이 일정에 참석 신청할 수 있어요."}`
      : `${h.memberName} 님의 신청을 반려했어요.`);
    await load(true);
  }

  if (!d) return error ? <div className="msg bad" role="alert">{error}</div> : <p className="small">불러오는 중이에요…</p>;
  const comments = d.comments ?? [];
  const apps = d.memberApps ?? 0;
  const pays = d.payNotices ?? [];
  const duesN = d.duesNotices ?? [];
  const empty = apps === 0 && pays.length === 0 && duesN.length === 0 && d.posts.length === 0 && d.toHandle.length === 0 && d.mine.length === 0 && comments.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {note && <div className="msg info" role="status">{note}</div>}
      {empty && <div className="msg info">새 알림이 없어요.</div>}

      {apps > 0 && (
        <Link href="/admin/member-apps" className="fb info" style={{ textDecoration: "none", alignItems: "center" }}>
          <span className="ic" aria-hidden="true">!</span>
          <span className="grow"><b>승인 전 회원 신청 {apps}건</b><span className="t">회원관리 › 회원신청관리에서 확인하기 ›</span></span>
        </Link>
      )}

      {duesN.length > 0 && (
        <section aria-labelledby="al-dues" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-dues" style={sectionTitle}>확인할 모임 회비 입금 알림 {duesN.length}건</h3>
          {duesN.map((p) => (
            <Link key={p.id} href={`/admin/dues/payments?period=${encodeURIComponent(p.period)}`} className="fb info" style={{ textDecoration: "none", alignItems: "center" }}>
              <span className="ic" aria-hidden="true">₩</span>
              <span className="grow"><b>{p.memberName} 님이 모임 회비를 입금했다고 알렸어요</b><span className="t">{p.periodLabel} · {fmtDate(p.at)} · 회비입금에서 확인하기 ›</span></span>
            </Link>
          ))}
        </section>
      )}

      {pays.length > 0 && (
        <section aria-labelledby="al-pay" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-pay" style={sectionTitle}>확인할 입금 알림 {pays.length}건</h3>
          {pays.map((p) => (
            <Link key={p.id} href={`/admin/events/${p.eventId}?tab=fee${p.club ? `&club=${encodeURIComponent(p.club)}` : ""}`} className="fb info" style={{ textDecoration: "none", alignItems: "center" }}>
              <span className="ic" aria-hidden="true">₩</span>
              <span className="grow"><b>{p.memberName} 님이 입금했다고 알렸어요</b><span className="t">{p.eventName} · {fmtDate(p.at)} · 회비 탭에서 입금 확인하기 ›</span></span>
            </Link>
          ))}
        </section>
      )}

      {d.toHandle.length > 0 && (
        <section aria-labelledby="al-h1" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-h1" style={sectionTitle}>처리할 참관·클럽 신청 {d.toHandle.length}건</h3>
          {d.toHandle.map((h) => (
            <div key={h.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <b>{h.memberName} 님 · {h.kindLabel}</b>
              <span className="small">{[h.club, h.eventName, fmtDate(h.createdAt)].filter(Boolean).join(" · ")}</span>
              {h.message && <span className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{h.message}”</span>}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" type="button" disabled={!!busy} style={{ minHeight: 46 }} onClick={() => decide(h, "approve")}
                  aria-label={`${h.memberName} 님 ${h.kindLabel} 승인`}>승인</button>
                <button className="btn white" type="button" disabled={!!busy} style={{ minHeight: 46 }} onClick={() => decide(h, "decline")}
                  aria-label={`${h.memberName} 님 ${h.kindLabel} 반려`}>반려</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {comments.length > 0 && (
        <section aria-labelledby="al-h4" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-h4" style={sectionTitle}>내 글에 달린 댓글 {comments.length}개</h3>
          <ul className="rows">
            {comments.map((c) => (
              <li key={c.id}>
                <Link href={`/board/${c.postId}#comments`} className="opt rowopt" style={{ textDecoration: "none" }}>
                  <span aria-hidden="true" style={{ flex: "none" }}>💬</span>
                  <span className="name grow" style={{ overflowWrap: "anywhere" }}>{c.name} 님이 ‘{c.title}’에 댓글을 남겼어요</span>
                  <span className="small" style={{ flex: "none" }}>{fmtDate(c.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.mine.length > 0 && (
        <section aria-labelledby="al-h2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-h2" style={sectionTitle}>내가 보낸 신청</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {d.mine.map((m) => (
              <li key={m.id} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <span className="grow">
                  <b style={{ display: "block" }}>{what(m)}</b>
                  <span className="small">
                    {fmtDate(m.createdAt)} 신청{m.handledAt ? ` · ${fmtDate(m.handledAt)} ${m.handledByName ? `${m.handledByName} 님이 ` : ""}처리` : ""}
                  </span>
                  {m.status === "declined" && m.reason && <span className="small" style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>반려 사유: {m.reason}</span>}
                </span>
                {m.unseen && <span className="pill blue">새 결과</span>}
                <span className={`pill ${STATUS[m.status]?.tone ?? "gray"}`}>{STATUS[m.status]?.text ?? m.status}</span>
                {m.status === "pending" && (
                  <button className="mini" type="button" disabled={!!busy} onClick={() => cancelMine(m)} aria-label={`${what(m)} 취소`}>신청 취소</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.posts.length > 0 && (
        <section aria-labelledby="al-h3" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-h3" style={sectionTitle}>새 글·수정된 글 {d.posts.length}개</h3>
          <ul className="rows">
            {d.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/board/${p.id}`} className="opt rowopt" style={{ textDecoration: "none" }}>
                  <FreshChip fresh={p.fresh} style={{ flex: "none" }} />
                  <span className="name grow" style={{ overflowWrap: "anywhere" }}>{p.title}</span>
                  <span className="small" style={{ flex: "none" }}>{fmtDate(p.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
