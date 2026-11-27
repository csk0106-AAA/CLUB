"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export type NextLink = { href: string; name: string; eventId?: string; aid?: string; teamId?: string };

// 진행자 화면 마지막의 "다음 활동으로 이동": 다음 활동을 대기 상태로 먼저 열어(회원 화면 맨 위 "들어가기" 줄이 바로 그 활동으로)
// 그 진행 화면으로 넘어간다. 대기 상태로 열지 못해도 이동은 한다.
export function NextActivityButton({ next, style }: { next: NextLink; style?: React.CSSProperties }) {
  const [busy, setBusy] = useState(false);
  async function go(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    if (next.eventId && next.aid) {
      await api(`/api/admin/events/${next.eventId}/activities/${next.aid}/live${next.teamId ? `?team=${encodeURIComponent(next.teamId)}` : ""}`, { body: { action: "ready" } }).catch(() => undefined);
    }
    window.location.href = next.href;
  }
  return (
    <a className="btn blue" href={next.href} onClick={go} aria-busy={busy}
      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}>
      {busy ? "다음 활동으로 이동 중…" : `다음 활동으로 이동 › ${next.name}`}
    </a>
  );
}
