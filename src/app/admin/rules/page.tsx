"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { PublishBox, type PubPost } from "@/components/PublishBox";
import { RulesEditor } from "@/components/board/RulesEditor";
import type { Audience } from "@/lib/audience";
import { api } from "@/lib/client";

const ALL: Audience = { mode: "all", events: [], clubs: [], memberIds: [] };

type Data = { posts: PubPost[]; linked: string; template: { title: string; body: string } };

// 관리자 › 모임설정 › 회칙: 회칙 조문을 고치고(“확정”한 조문만), 게시판 회칙 글로 올린다. 모든 권한 관리자만.
function Rules() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await api<Data>("/api/admin/rules/publish");
    if (r.ok) setData(r.data);
    else setError(r.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="small" style={{ margin: 0 }}>회칙 조문을 고친 뒤 “확정”으로 표시하고, 아래 “게시글 업로드”로 게시판 회칙 글에 올려요. 글에는 올린 그때의 확정 조문이 담겨요.</p>
      <RulesEditor />
      {error && <div className="msg bad" role="alert">{error}</div>}
      {data && (
        <PublishBox
          what="회칙 글"
          endpoint="/api/admin/rules/publish"
          posts={data.posts}
          linked={data.linked}
          defaultTitle={data.template.title}
          defaultBody={data.template.body}
          defaultAudience={ALL}
          onDone={load}
        />
      )}
    </div>
  );
}

export default function RulesPage() {
  return <AdminGate mode="group" need={["group"]} active="/admin/rules"><Rules /></AdminGate>;
}
