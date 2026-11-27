"use client";

import { useEffect, useState } from "react";
import { playSfx, setSfxOn, sfxOn, unlockSfx } from "@/lib/sfx";

// 진행자 화면 위쪽: 효과음 켜기·끄기(이 기기에만 저장). 누를 때 소리를 깨우고 켜졌으면 "띵동"으로 확인한다.
export function SfxToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(sfxOn()); }, []);
  // 화면 어디든 처음 누르면 소리를 깨운다(휴대폰·태블릿 규칙)
  useEffect(() => {
    const wake = () => unlockSfx();
    window.addEventListener("pointerdown", wake, { once: true });
    return () => window.removeEventListener("pointerdown", wake);
  }, []);
  return (
    <button className="mini" type="button" aria-pressed={on} title="진행 효과음 켜기·끄기(이 기기에만 저장)"
      onClick={() => { const next = !on; setSfxOn(next); setOn(next); unlockSfx(); if (next) playSfx("ding"); }}>
      {on ? "🔊 소리 켜짐" : "🔇 소리 꺼짐"}
    </button>
  );
}
