"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

// 사회자 전체화면 위쪽 "돌아가기": 사회자 접속이면 사회자 첫 화면, 관리자면 행사 관리 화면으로.
export function HostBack({ eventId }: { eventId: string }) {
  const [host, setHost] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ mode: string }>("/api/host").then((r) => setHost(r.ok && r.data.mode === "host"));
  }, []);
  if (host === null) return null;
  return (
    <Link className="mini" href={host ? "/host" : `/admin/events/${eventId}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
      {host ? "‹ 진행 목록" : "관리자로 돌아가기"}
    </Link>
  );
}

// 권한이 없을 때 사회자 화면에 보여 줄 안내
export function HostDenied() {
  return (
    <div className="host" role="alert">
      <h1>사회자 확인이 필요해요</h1>
      <p className="sub">관리자로 로그인하거나, 이 활동의 사회자 접속번호로 로그인한 뒤 다시 열어 주세요.</p>
      <Link className="btn" href="/" style={{ width: "auto", alignSelf: "flex-start", textDecoration: "none" }}>로그인 화면으로</Link>
    </div>
  );
}
