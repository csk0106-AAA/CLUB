"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export type NextLink = { href: string; name: string; eventId?: string; aid?: string; teamId?: string };

// 진행자 화면 마지막의 "다음 활동으로 이동": 다음 활동을 대기 상태로 먼저 열어(회원 화면 맨 위 "들어가기" 줄이 바로 그 활동으로)
// 그 진행 화면으로 넘어간다. 대기 상태로 열지 못해도 이동은 한다.
export function NextActivityButton({ next, style, label }: { next: NextLink; style?: React.CSSProperties; label?: string }) {
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
      {busy ? "이동 중…" : label ?? `다음 활동으로 이동 › ${next.name}`}
    </a>
  );
}

// 활동 마지막 화면의 끝맺음: 다음 활동이 있으면 이동 버튼, 없으면 "남은 활동이 없습니다" + 남은 고민이 있으면 다시 나누기
export function EndOfActivities({ next, leftover, style }: { next?: NextLink | null; leftover?: (NextLink & { remaining: number }) | null; style?: React.CSSProperties }) {
  if (next) return <NextActivityButton next={next} style={style} />;
  return (
    <>
      <span className="sub" role="status" style={{ alignSelf: "center", fontSize: 20, flex: "1 1 200px" }}>남은 활동이 없습니다.</span>
      {leftover && <NextActivityButton next={leftover} style={style} label={`고민을 다시 나누어 볼까요? › 남은 고민 ${leftover.remaining}개`} />}
    </>
  );
}
