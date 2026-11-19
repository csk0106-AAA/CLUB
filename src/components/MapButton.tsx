"use client";

import { useState } from "react";
import { Popup } from "./Popup";
import { fs } from "@/lib/fs";
import { MAP_NAME, mapHref, readMapPref } from "@/lib/map-pref";

// 지도 링크 묶음(팝업 안 등): 설정에서 지도를 하나로 정했으면 그 지도 하나, 아니면 구글·네이버 둘 다.
export function MapLinks({ place, onPick, small }: { place: string; onPick?: () => void; small?: boolean }) {
  const pref = typeof window === "undefined" ? "ask" : readMapPref();
  const kinds = pref === "ask" ? (["google", "naver"] as const) : ([pref] as const);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", flexDirection: small ? "row" : "column", flexWrap: "wrap", gap: 8 }}>
      {kinds.map((k) => (
        <a key={k} className={small ? "mini" : "btn white"} href={mapHref(k, place)} target="_blank" rel="noopener noreferrer" onClick={onPick}
          style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {MAP_NAME[k]}에서 보기
        </a>
      ))}
    </div>
    {/* 매번 고르기(설정 기본)일 때: 설정에서 하나로 정하면 바로 열린다고 알려 준다 */}
    {pref === "ask" && <span className="small" style={{ fontSize: fs(12) }}>설정 › 지도 보기에서 구글 지도나 네이버 지도로 정해 두면, 다음부터 이 창 없이 그 지도로 바로 열려요.</span>}
    </div>
  );
}

// "지도 보기" 버튼: 설정에서 지도를 하나로 정했으면 바로 그 지도를 열고, 아니면 구글·네이버 중 고르는 창을 띄운다.
//  children 을 주면 그 모양으로(예: 일정 카드의 장소 줄), 없으면 작은 "지도 보기" 버튼.
export function MapButton({ place, children, className, style, label }: { place: string; children?: React.ReactNode; className?: string; style?: React.CSSProperties; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!place.trim()) return null;
  function go() {
    const pref = readMapPref();
    if (pref === "ask") return setOpen(true);
    window.open(mapHref(pref, place), "_blank", "noopener,noreferrer");
  }
  return (
    <>
      <button type="button" className={className ?? "mini"} style={style} aria-haspopup="dialog" aria-label={label ?? `${place}, 지도 보기`} onClick={go}>
        {children ?? "지도 보기"}
      </button>
      <Popup id="map-pick" open={open} onClose={() => setOpen(false)} title="지도 보기" width={420}>
        <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{place}</p>
        <MapLinks place={place} onPick={() => setOpen(false)} />
      </Popup>
    </>
  );
}
