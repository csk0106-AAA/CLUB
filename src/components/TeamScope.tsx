"use client";

import { useCallback, useEffect, useState } from "react";

// 조별 진행: 진행자 화면 주소의 ?team=조 id 를 읽고 바꾼다. 처음 읽기 전에는 null(그동안 서버를 부르지 않는다).
export function useTeamParam(): [string | null, (t: string) => void] {
  const [team, setTeam] = useState<string | null>(null);
  useEffect(() => {
    setTeam(new URLSearchParams(window.location.search).get("team") ?? "");
  }, []);
  const change = useCallback((t: string) => {
    setTeam(t);
    const u = new URL(window.location.href);
    if (t) u.searchParams.set("team", t);
    else u.searchParams.delete("team");
    window.history.replaceState(null, "", u.toString());
  }, []);
  return [team, change];
}

// API 주소 뒤에 붙일 ?team=
export const teamQ = (team: string | null | undefined): string => (team ? `?team=${encodeURIComponent(team)}` : "");

// 진행자 화면 위쪽 조 고르기. 조가 하나뿐이면(조 진행자) 이름만 보인다.
export function TeamPicker({ teams, value, onChange }: { teams: { id: string; name: string }[]; value: string; onChange: (t: string) => void }) {
  if (teams.length === 0) return null;
  if (teams.length === 1) return <span className="pill blue" style={{ fontSize: 15 }}>{teams[0].name} 진행 중</span>;
  return (
    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 15 }}>
      <span className="sub">진행할 조</span>
      <select className="field" style={{ width: "auto", minHeight: 36, fontSize: 15, padding: "0 8px" }} value={value} onChange={(e) => onChange(e.target.value)}>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}
