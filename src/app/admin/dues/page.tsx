"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { AdminIssues } from "@/components/AdminIssues";
import { DuesForm, DuesPreview, duesProblem, PERIOD, type DuesValue } from "@/components/DuesForm";
import { PublishBox, type PubPost } from "@/components/PublishBox";
import type { Audience } from "@/lib/audience";
import { api, won } from "@/lib/client";
import { fs } from "@/lib/fs";

const ALL: Audience = { mode: "all", events: [], clubs: [], memberIds: [] };

type Data = {
  dues: DuesValue; summary: string; options: { positions: string[]; kinds: string[] };
  dist: { amount: string; count: number }[]; posts: PubPost[]; linked: string; template: { body: string };
};
type Note = { tone: "bad" | "info"; text: string } | null;

const yearOf = (d: DuesValue) => (d.periodEnd || d.periodStart).slice(0, 4) || String(new Date().getFullYear());

// 관리자 › 모임설정 › 회비관리: 모임 회비(연회비·월회비)를 정하고, 게시판 글로 올린다.
function DuesEditor() {
  const [data, setData] = useState<Data | null>(null);
  const [d, setD] = useState<DuesValue | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/admin/dues");
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setData(r.data);
    setD(r.data.dues);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!d || !data) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const dirty = JSON.stringify(d) !== JSON.stringify(data.dues);

  async function save(): Promise<boolean> {
    if (!d) return false;
    const problem = duesProblem(d);
    if (problem) {
      setNote({ tone: "bad", text: problem });
      return false;
    }
    setBusy(true);
    setNote(null);
    const r = await api<{ dues: DuesValue }>("/api/admin/dues", { method: "PUT", body: d });
    setBusy(false);
    if (!r.ok) {
      setNote({ tone: "bad", text: r.error });
      return false;
    }
    setNote({ tone: "info", text: "회비 설정을 저장했어요. 게시판에 알리려면 아래 “게시글 업로드”로 올려 주세요." });
    await load();
    return true;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="small" style={{ margin: 0, fontSize: fs(12) }}>모임 회비(연회비·월회비)를 정해요. 여기서 정한 입금계좌는 새 일정을 만들 때 일정 계좌로 먼저 들어가요(소모임 일정은 소모임 계좌). 회원에게 알리려면 저장한 뒤 아래에서 게시글로 올려 주세요.</p>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <DuesForm value={d} onChange={setD} kinds={data.options.kinds} positions={data.options.positions} unit={PERIOD[d.period]} />
        <DuesPreview d={d} extra={data.dist.length > 0 && data.summary && (
          <span className="small">저장된 기준 회원 수: {data.dist.map((x) => `${x.amount ? won(x.amount) : "회비 없음"} ${x.count}명`).join(" · ")}</span>
        )} />
        <button className="btn" type="submit" disabled={busy || !dirty} style={{ width: "auto", minWidth: 160, minHeight: 44, fontSize: fs(14), alignSelf: "flex-end" }}>{busy ? "저장 중…" : dirty ? "저장" : "저장됨"}</button>
      </form>

      <PublishBox
        what="회비 글"
        endpoint="/api/admin/dues/publish"
        posts={data.posts}
        linked={data.linked}
        defaultTitle={`${yearOf(d)}년 ${PERIOD[d.period]} 안내`}
        defaultBody={data.template.body}
        defaultAudience={ALL}
        beforePublish={async () => (dirty ? save() : true)}
        onDone={load}
      />
    </div>
  );
}

export default function DuesPage() {
  return <AdminGate mode="group" need={["fees"]} active="/admin/dues"><AdminIssues /><DuesEditor /></AdminGate>;
}
