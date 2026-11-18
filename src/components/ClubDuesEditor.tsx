"use client";

import { useCallback, useEffect, useState } from "react";
import { DuesForm, DuesPreview, duesProblem, type DuesValue } from "@/components/DuesForm";
import { PublishBox, type PubPost } from "@/components/PublishBox";
import type { Audience } from "@/lib/audience";
import { api } from "@/lib/client";
import { clubLabel } from "@/lib/club-label";
import { fs } from "@/lib/fs";

type Data = {
  club: string; dues: DuesValue; summary: string; options: { positions: string[]; kinds: string[] };
  posts: PubPost[]; linked: string; memberIds: string[]; headRole: string; admin: boolean; template: { body: string };
};
type Note = { tone: "bad" | "info"; text: string } | null;

// 클럽 회비: 회비를 정하고 게시판 글로 올린다(제목 앞에 [클럽 이름], 기본 공개 대상은 그 클럽 회원).
// 관리자 › 클럽관리 › 클럽 화면과 회원용 /clubs/[이름]/dues(클럽 회장·대표) 화면이 함께 쓴다.
export function ClubDuesEditor({ club }: { club: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [d, setD] = useState<DuesValue | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/clubs/${encodeURIComponent(club)}/dues`;

  const load = useCallback(async () => {
    const r = await api<Data>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setData(r.data);
    setD(r.data.dues);
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);
  // 게시글 "수정"으로 들어오면(…#club-dues) 불러온 뒤 이 칸으로 내려간다
  const ready = !!data;
  useEffect(() => {
    if (ready && window.location.hash === "#club-dues") document.getElementById("club-dues")?.scrollIntoView({ block: "start" });
  }, [ready]);

  if (!d || !data) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const dirty = JSON.stringify(d) !== JSON.stringify(data.dues);
  const year = (d.periodEnd || d.periodStart).slice(0, 4) || String(new Date().getFullYear());
  const audience: Audience = data.memberIds.length
    ? { mode: "clubs", events: [], clubs: [data.club], memberIds: data.memberIds }
    : { mode: "all", events: [], clubs: [], memberIds: [] };

  async function save(): Promise<boolean> {
    if (!d) return false;
    const problem = duesProblem(d);
    if (problem) {
      setNote({ tone: "bad", text: problem });
      return false;
    }
    setBusy(true);
    setNote(null);
    const r = await api(base, { method: "PUT", body: d });
    setBusy(false);
    if (!r.ok) {
      setNote({ tone: "bad", text: r.error });
      return false;
    }
    setNote({ tone: "info", text: `${clubLabel(data?.club ?? "")} 회비를 저장했어요. 클럽 회원에게 알리려면 아래 “게시글 업로드”로 올려 주세요.` });
    await load();
    return true;
  }

  return (
    <div id="club-dues" style={{ display: "flex", flexDirection: "column", gap: 14, scrollMarginTop: 16 }}>
      <b style={{ font: `700 ${fs(16)} var(--display)` }}>{clubLabel(data.club)} 회비</b>
      <span className="small" style={{ fontSize: fs(12), marginTop: -8 }}>관리자와 클럽 {data.headRole || "회장"}이 정할 수 있어요. 여기 입금계좌가 클럽 일정을 만들 때 일정 입금계좌로 먼저 들어가요.</span>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <DuesForm value={d} onChange={setD} kinds={data.options.kinds} positions={data.options.positions} unit="회비" posLabel="클럽 직책" />
        <DuesPreview d={d} />
        <button className="btn" type="submit" disabled={busy || !dirty} style={{ width: "auto", minWidth: 160, minHeight: 44, fontSize: fs(14), alignSelf: "flex-end" }}>{busy ? "저장 중…" : dirty ? "회비 저장" : "저장됨"}</button>
      </form>
      <PublishBox
        what={`${clubLabel(data.club)} 회비 글`}
        endpoint={`${base}/publish`}
        posts={data.posts}
        linked={data.linked}
        defaultTitle={`[${data.club}] ${year}년 회비 안내`}
        defaultBody={data.template.body}
        defaultAudience={audience}
        titleHint={`제목 앞에 [${data.club}]이 없으면 붙여서 올려요.`}
        beforePublish={async () => (dirty ? save() : true)}
        onDone={load}
      />
    </div>
  );
}
