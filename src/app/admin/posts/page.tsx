"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { FORM_LABEL } from "@/lib/board";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";

type P = { id: string; form: string; title: string; authorName: string; createdAt: string; updatedAt: string; notice: boolean; pinned: boolean; postFrom: string; postUntil: string; status: "live" | "before" | "ended" };
const STATUS: Record<P["status"], { text: string; tone: string }> = { live: { text: "게시 중", tone: "ok" }, before: { text: "게시 전", tone: "blue" }, ended: { text: "게시 종료", tone: "gray" } };

// 관리자 › 모임설정 › 게시글관리: 게시 기간이 지난 글까지 모든 게시글을 본다(눌러서 보기·고치기)
function Posts() {
  const [list, setList] = useState<P[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"all" | P["status"]>("all");
  useEffect(() => {
    api<{ posts: P[] }>("/api/admin/posts").then((r) => (r.ok ? setList(r.data.posts) : setErr(r.error)));
  }, []);
  if (err) return <div className="msg bad" role="alert">{err}</div>;
  if (!list) return <p className="small">불러오는 중이에요…</p>;
  const count = (k: "all" | P["status"]) => (k === "all" ? list.length : list.filter((p) => p.status === k).length);
  const shown = list.filter((p) => filter === "all" || p.status === filter);
  const period = (p: P) => (!p.postFrom && !p.postUntil ? "계속 게시" : `${p.postFrom ? fmtDateTime(p.postFrom) : "올린 때"} ~ ${p.postUntil ? fmtDateTime(p.postUntil) : "계속"}`);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="small">게시 기간이 지난 글도 모두 보여요. 회원 게시판에는 “게시 중”인 글만 보여요. 글을 누르면 열어 봐요. 게시 종료·게시 전 글은 “다시 게시”에서 게시 기간·내용을 고치고, 투표·좋아요·댓글을 초기화할지 골라 다시 올릴 수 있어요.</span>
      <div className="seg" role="group" aria-label="게시 상태" style={{ alignSelf: "flex-start" }}>
        {(["all", "live", "before", "ended"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} style={{ minHeight: 38, padding: "0 12px" }}>
            {k === "all" ? "전체" : STATUS[k].text} {count(k)}
          </button>
        ))}
      </div>
      {shown.length === 0 && <div className="msg info">해당하는 글이 없어요.</div>}
      <ul className="rows" style={{ margin: 0 }}>
        {shown.map((p) => (
          <li key={p.id}>
            <Link href={`/board/${p.id}`} className="post" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 14px", textDecoration: "none", color: "inherit" }}>
              <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className={`pill ${STATUS[p.status].tone}`}>{STATUS[p.status].text}</span>
                <span className="chip line">{FORM_LABEL[p.form as keyof typeof FORM_LABEL] ?? p.form}</span>
                {p.notice && <span className="chip red">공지</span>}
                {p.pinned && <span className="chip gray">고정</span>}
              </span>
              <b style={{ font: `700 ${fs(16)} var(--display)`, overflowWrap: "anywhere" }}>{p.title}</b>
              <span className="small">{p.authorName || "운영진"} · {fmtDate(p.createdAt)} 작성 · 게시 기간 {period(p)}</span>
            </Link>
            {p.status !== "live" && (
              <span className="row" style={{ padding: "0 14px 10px", justifyContent: "flex-end" }}>
                <Link className="btn" href={`/board/${p.id}/edit?repost=1`} style={{ width: "auto", minHeight: 36, padding: "0 14px", textDecoration: "none" }}>다시 게시</Link>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return <AdminGate mode="group" active="/admin/posts" need={["all", "write"]}><Posts /></AdminGate>;
}
