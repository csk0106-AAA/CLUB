"use client";

import { Mascot } from "./Mascot";
import { fs } from "@/lib/fs";

// 화면 아래에서 올라오는 선택 창 (졸업여행 날짜, 개인정보 동의 등). mascot 이면 제목 옆에 캐릭터를 둔다.
export function Sheet({ title, mascot, children }: { title: string; mascot?: boolean; children: React.ReactNode }) {
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        {mascot ? (
          <div className="say" style={{ alignItems: "center" }}>
            <Mascot size={64} />
            <h2 className="title" style={{ fontSize: fs(20) }}>{title}</h2>
          </div>
        ) : (
          <h2 className="title" style={{ fontSize: fs(20) }}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
