"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client";
import { refreshUnread } from "./MemberTabs";

type Handle = {
  id: string; kind: string; kindLabel: string; club: string; eventId: string; eventName: string;
  memberName: string; message: string; createdAt: string;
};
type Mine = {
  id: string; kind: string; kindLabel: string; club: string; eventId: string; eventName: string;
  status: string; createdAt: string; handledAt: string; handledByName: string; unseen: boolean;
};
export type AlertsData = { posts: { id: string; title: string; at: string }[]; toHandle: Handle[]; mine: Mine[]; count: number };

const STATUS: Record<string, { text: string; tone: string }> = {
  pending: { text: "확인 기다리는 중", tone: "warn" },
  approved: { text: "승인됨", tone: "ok" },
  declined: { text: "거절됨", tone: "bad" },
};
const sectionTitle = { font: "400 18px var(--display)", margin: 0 } as const;
const what = (r: { kindLabel: string; club: string; eventName: string }) =>
  `${r.club} ${r.kindLabel}${r.eventName ? ` · ${r.eventName}` : ""}`;

// 홈 화면 종 아이콘을 누르면 뜨는 알림 목록.
// 열면(불러온 뒤) 새 글과 내 신청 결과를 "봤음"으로 표시한다. 처리할 신청은 승인·거절해야 숫자에서 빠진다.
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

  async function decide(h: Handle, decision: "approve" | "decline") {
    if (decision === "decline" && !window.confirm(`${h.memberName} 님의 ${h.kindLabel} 신청을 거절할까요?`)) return;
    setBusy(h.id);
    setNote("");
    const r = await api(`/api/club-requests/${h.id}`, { method: "PATCH", body: { decision } });
    setBusy("");
    if (!r.ok) return setError(r.error);
    setNote(decision === "approve"
      ? `${h.memberName} 님의 ${h.kindLabel} 신청을 승인했어요.${h.kind === "join" ? ` 이제 ${h.club} 회원이에요.` : " 이제 이 행사에 참석 신청할 수 있어요."}`
      : `${h.memberName} 님의 신청을 거절했어요.`);
    await load(true);
  }

  if (!d) return error ? <div className="msg bad" role="alert">{error}</div> : <p className="small">불러오는 중이에요…</p>;
  const empty = d.posts.length === 0 && d.toHandle.length === 0 && d.mine.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {note && <div className="msg info" role="status">{note}</div>}
      {empty && <div className="msg info">새 알림이 없어요.</div>}

      {d.toHandle.length > 0 && (
        <section aria-labelledby="al-h1" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-h1" style={sectionTitle}>처리할 소모임 신청 {d.toHandle.length}건</h3>
          {d.toHandle.map((h) => (
            <div key={h.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <b>{h.memberName} 님 · {h.kindLabel}</b>
              <span className="small">{h.club}{h.eventName ? ` · ${h.eventName}` : ""} · {fmtDate(h.createdAt)}</span>
              {h.message && <span className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{h.message}”</span>}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" type="button" disabled={!!busy} style={{ minHeight: 46 }} onClick={() => decide(h, "approve")}
                  aria-label={`${h.memberName} 님 ${h.kindLabel} 승인`}>승인</button>
                <button className="btn white" type="button" disabled={!!busy} style={{ minHeight: 46 }} onClick={() => decide(h, "decline")}
                  aria-label={`${h.memberName} 님 ${h.kindLabel} 거절`}>거절</button>
              </div>
            </div>
          ))}
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
                </span>
                {m.unseen && <span className="pill blue">새 결과</span>}
                <span className={`pill ${STATUS[m.status]?.tone ?? "gray"}`}>{STATUS[m.status]?.text ?? m.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.posts.length > 0 && (
        <section aria-labelledby="al-h3" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 id="al-h3" style={sectionTitle}>새 글 {d.posts.length}개</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {d.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/board/${p.id}`} className="opt rowopt" style={{ textDecoration: "none" }}>
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
