"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { OrgClubs, OrgList, type OrgClub, type OrgItem } from "./OrgChart";

type Data = { items: OrgItem[]; clubs: OrgClub[] };

// 조직도(읽기 전용). 홈 화면 "조직도" 아이콘 창과 /org 화면이 같이 쓴다.
// 회원 구분의 직책·소모임 직책과 회원 명단으로 그린다(관리자 › 회원관리 › 조직도에서 직책별 회원을 정한다).
export function OrgView({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Data>("/api/club/org").then((r) => {
      if (r.ok) setData(r.data);
      else if (r.status === 401) onUnauthorized?.();
      else setError(r.error);
    });
  }, [onUnauthorized]);

  return (
    <>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!data && !error && <p className="small">불러오는 중이에요…</p>}
      {data && (data.items.length ? <OrgList items={data.items} emptyText="(미정)" /> : <div className="msg info">아직 등록된 직책이 없어요.</div>)}
      {data && (
        <section className="otsec" aria-labelledby="org-clubs">
          <h2 id="org-clubs">소모임</h2>
          <OrgClubs clubs={data.clubs} />
        </section>
      )}
    </>
  );
}
