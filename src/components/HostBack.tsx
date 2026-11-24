"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

// 진행자 전체화면 위쪽 "돌아가기": 진행자 접속이면 진행자 첫 화면, 관리자면 그 일정의 활동 탭(진행하던 활동 위치)으로.
// 진행 중에 진행 화면과 활동 관리를 오가기 쉽게. activityId 가 없으면 일정 관리 화면.
export function HostBack({ eventId, activityId }: { eventId: string; activityId?: string }) {
  const [host, setHost] = useState<boolean | null>(null);
  const [member, setMember] = useState(false);
  useEffect(() => {
    api<{ mode: string }>("/api/host").then((r) => {
      setHost(r.ok && r.data.mode === "host");
      setMember(r.ok && r.data.mode === "member");
    });
  }, []);
  if (host === null) return null;
  // 조 진행자가 회원으로 로그인해서 "○조 진행하기"로 들어온 경우: 일정 화면으로
  if (member) {
    return (
      <Link className="mini" href={`/events/${eventId}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>‹ 일정으로 돌아가기</Link>
    );
  }
  return (
    <Link className="mini" href={host ? "/host" : activityId ? `/admin/events/${eventId}?tab=act#act-${activityId}` : `/admin/events/${eventId}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
      {host ? "‹ 진행 목록" : activityId ? "‹ 활동으로 돌아가기" : "관리자로 돌아가기"}
    </Link>
  );
}

// 권한이 없을 때 진행자 화면에 보여 줄 안내
export function HostDenied() {
  return (
    <div className="host" role="alert">
      <h1>진행자 확인이 필요해요</h1>
      <p className="sub">관리자로 로그인하거나, 이 활동의 진행자 접속번호로 로그인한 뒤 다시 열어 주세요. 조 진행자는 관리자가 “조별로 따로 진행”을 켜야 진행할 수 있어요.</p>
      <Link className="btn" href="/" style={{ width: "auto", alignSelf: "flex-start", textDecoration: "none" }}>로그인 화면으로</Link>
    </div>
  );
}
