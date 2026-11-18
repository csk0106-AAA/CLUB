"use client";

import Link from "next/link";
import { useState } from "react";
import { EventDuplicate } from "./EventDuplicate";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 관리자 일정 목록 한 줄의 오른쪽 버튼: 수정(일정 관리 화면으로) · 복제(새 초안으로) · 삭제(권한자·만든 사람) · 공개취소(공개된 일정)
// 공개취소는 일정을 지우지 않고 초안으로 돌린다(목록에는 남고 회원에게만 안 보인다).
export function EventRowActions({ ev, href, onDeleted, onUnpublished }: {
  ev: { id: string; name: string; published: string; canDelete?: boolean; startsAt?: string; club?: string };
  href: string;
  onDeleted: (id: string) => void;
  onUnpublished: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pub = ev.published === "true";

  async function del() {
    if (!window.confirm(`“${ev.name}” 일정을 지울까요?\n참석 신청·회비·세부일정·활동 기록도 함께 지워지고 되돌릴 수 없어요.\n(회원에게만 감추려면 “공개취소”를 누르세요)`)) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${encodeURIComponent(ev.id)}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return window.alert(r.error);
    onDeleted(ev.id);
  }

  async function unpublish() {
    if (!window.confirm(`“${ev.name}” 일정의 공개를 취소할까요?\n목록에는 초안으로 남고, 회원 화면에서는 보이지 않아요.`)) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${encodeURIComponent(ev.id)}`, { method: "PATCH", body: { published: false } });
    setBusy(false);
    if (!r.ok) return window.alert(r.error);
    onUnpublished(ev.id);
  }

  const btn = { minHeight: 34, width: 76, fontSize: fs(13), padding: "0 10px", justifyContent: "center" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }} role="group" aria-label={`${ev.name} 일정 버튼`}>
      <Link href={href} className="mini" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>수정</Link>
      <EventDuplicate ev={ev} />
      {ev.canDelete && <button type="button" className="mini danger" style={btn} disabled={busy} onClick={del}>삭제</button>}
      {pub && <button type="button" className="mini" style={btn} disabled={busy} onClick={unpublish}>공개취소</button>}
    </div>
  );
}
