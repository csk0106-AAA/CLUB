"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Popup } from "./Popup";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 프로필 북에 보이는 회원(정회원·준회원·명예회원 등)이 아직 소개를 쓰지 않았을 때, 처음 한 번 띄우는 안내.
// 관리자가 미리 등록해 둔 회원과 대기·참관에서 회원이 된 분도 처음 들어올 때 한 번 본다(/api/me bookGuide).
// 닫으면(작성하기·나중에) 다시 띄우지 않는다(Members.extra.bookGuideAt). ready: 개인정보 동의 등 앞선 안내가 끝났을 때.
export function BookGuide({ ready, show, name }: { ready: boolean; show: boolean; name: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (ready && show) setOpen(true);
  }, [ready, show]);

  function done() {
    setOpen(false);
    api("/api/me/book-guide", { body: {} });
  }

  return (
    <Popup id="book-guide" width={420} title="프로필 북에 나를 소개해 보세요" open={open} onClose={done}
      footer={(
        <div className="row" style={{ gap: 8 }}>
          <button className="btn white" type="button" style={{ flex: 1 }} onClick={done}>나중에</button>
          <Link className="btn" href="/profiles/write" onClick={done} style={{ flex: 1, textDecoration: "none" }}>소개 작성하기</Link>
        </div>
      )}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: fs(15), lineHeight: 1.6 }}>
        <span>프로필 북에 소개를 남기면 모임 회원들이 <b>{name}</b>님을 더 잘 알게 돼요.</span>
        <span>AI가 묻고 답하는 인터뷰로 진행돼서 부담 없이 쓸 수 있어요.</span>
        <span className="small">작성한 뒤에도 보이기 싫으면 <b>설정 › 프로필 북</b>에서 숨길 수 있어요.</span>
      </div>
    </Popup>
  );
}
