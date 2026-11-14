"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { OrgChart } from "./OrgChart";

type Org = { id: string; dept: string; role: string; name: string; clubName: string; frequency: string; leader: string };

// 조직도(읽기 전용). 홈 화면 "조직도" 아이콘 창과 /org 화면이 같이 쓴다.
// 관리자는 관리자 > 회원관리 > 조직도에서 고친다.
export function OrgView({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const [org, setOrg] = useState<Org[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: Org[] }>("/api/club/org").then((r) => {
      if (r.ok) setOrg(r.data.items);
      else if (r.status === 401) onUnauthorized?.();
      else setError(r.error);
    });
  }, [onUnauthorized]);

  const groups = new Map<string, Org[]>();
  (org ?? []).filter((o) => !o.clubName).forEach((o) => groups.set(o.dept, [...(groups.get(o.dept) ?? []), o]));
  const clubs = (org ?? []).filter((o) => o.clubName);

  return (
    <>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!org && !error && <p className="small">불러오는 중이에요…</p>}
      {org && org.length === 0 && <div className="msg info">아직 등록된 조직도가 없어요.</div>}
      {org && org.length > 0 && <OrgChart items={org} emptyText="(미정)" />}
      {[...groups.entries()].map(([dept, rows]) => (
        <div key={dept} className="card"><b>{dept}</b>{rows.map((r) => <div key={r.id} className="small">{r.role ? `${r.role} · ` : ""}{r.name || "(미정)"}</div>)}</div>
      ))}
      {clubs.length > 0 && (
        <div className="card"><b>소모임</b>
          {clubs.map((c) => <div key={c.id} className="small">{c.clubName}{c.leader ? ` · 리더 ${c.leader}` : " · 리더 선정 예정"}{c.frequency ? ` · ${c.frequency}` : ""}</div>)}
        </div>
      )}
    </>
  );
}
