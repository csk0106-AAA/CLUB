"use client";

import { Mascot } from "./Mascot";
import { fs } from "@/lib/fs";

// 화면 아래에서 올라오는 선택 창 (참석 날짜 고르기, 개인정보 동의 등). mascot 이면 제목 옆에 캐릭터를 둔다.
export function Sheet({ title, mascot, children }: { title: string; mascot?: boolean; children: React.ReactNode }) {
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        {mascot ? (
          <div className="say" style={{ alignItems: "center" }}>
            <Mascot size={36} />
            <h2 className="title" style={{ fontSize: fs(17) }}>{title}</h2>
          </div>
        ) : (
          <h2 className="title" style={{ fontSize: fs(17) }}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
