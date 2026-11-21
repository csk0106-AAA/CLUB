"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LessonHeader } from "@/components/LessonHeader";
import { WhoWrite, type Note, type WhoState } from "@/components/WhoWrite";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 프로필 북의 "소개 작성하기": '내가 누구일까요?' 템플릿 v1의 AI 인터뷰(질문·지침)로 내 소개를 쓴다.
// 일정 활동이 아니라서 2진실 1거짓은 없고, 배포하면 프로필 북에 실명으로 바로 보인다.
const AID = "profile-book";

export default function ProfileWritePage() {
  const router = useRouter();
  const [st, setSt] = useState<WhoState | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<WhoState>(`/api/who/${AID}`);
    if (r.ok) setSt(r.data);
    else if (r.status === 401) router.replace("/");
    else setNote({ tone: "bad", text: r.error });
  }, [router]);
  useEffect(() => {
    load();
  }, [load]);

  const iv = st?.interview;
  const progress = iv && iv.messages.length > 0
    ? { done: iv.status === "done" ? Math.max(iv.answered, iv.required) : iv.answered, total: Math.max(1, iv.required) }
    : null;

  return (
    <main className="app">
      <LessonHeader href="/profiles" closeLabel="프로필 북으로 돌아가기" title="내 소개 작성하기" done={progress?.done} total={progress?.total} />
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {!st && !note && <p className="small">불러오는 중이에요…</p>}
      {st && (st.blockedBy ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: `700 ${fs(16)} var(--display)` }}>“내가 누구일까요?” 활동에 참여 중이에요</b>
          <span className="small">실명 공개 전까지는 그 활동에서 별칭으로 소개를 써요.</span>
          <Link className="btn" href={`/events/${st.blockedBy.eventId}/who/${st.blockedBy.aid}`} style={{ textDecoration: "none" }}>활동으로 가기</Link>
        </div>
      ) : (
        <>
          <p className="small" style={{ margin: 0, fontSize: fs(13) }}>AI와의 인터뷰를 통해 나를 소개하세요. 다 쓰고 배포하면 프로필 북에 내 이름과 함께 보여요.</p>
          <WhoWrite st={st} aid={AID} busy={busy} setBusy={setBusy} setNote={setNote} reload={load} />
        </>
      ))}
    </main>
  );
}
