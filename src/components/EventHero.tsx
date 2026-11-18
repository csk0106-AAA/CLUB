"use client";

import { useState } from "react";
import { IconCalendar, IconNext } from "./Icons";
import { Popup } from "./Popup";
import { clubText } from "./EventInfoCard";
import { fmtDate, fmtRange } from "@/lib/client";

// 회원 일정 화면 맨 위: 홈 일정 카드와 같은 둥근 사진 카드(위쪽 D-day·유형 라벨, 아래쪽 안에 일정명·일시·장소). 장소를 누르면 구글·네이버 지도 고르기.
// 사진은 일정 목록 카드와 같은 규칙(회원 사진 중 좋아요 많은 것 → 먼저 올린 것 → 클럽·모임 대표사진). 없으면 바탕색 칸.
export type HeroEvent = {
  type?: string; name: string; startsAt: string; endsAt: string; place: string;
  club?: string; clubLeaders?: { name: string; role: string }[]; coverUrl?: string; going?: number;
};

const mapLinks = (place: string) => [
  { label: "구글 지도", href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` },
  { label: "네이버 지도", href: `https://map.naver.com/p/search/${encodeURIComponent(place)}` },
];

function IconPlace({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

// 남은 날: "D-23" / "내일" / "오늘"(진행 중 포함) / 지난 일정은 "" — 홈 카드(components/EventRail.tsx)와 같은 규칙
function dday(startsAt: string, endsAt: string): string {
  const s = fmtDate(startsAt).replace(/\//g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const e = (fmtDate(endsAt || startsAt) || s).replace(/\//g, "-");
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  if (s <= today && today <= e) return "오늘";
  if (e < today) return "";
  const [y, m, d] = s.split("-").map(Number);
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86_400_000);
  return n === 1 ? "내일" : `D-${n}`;
}

export function EventHero({ ev, children }: { ev: HeroEvent; children?: React.ReactNode }) {
  const [maps, setMaps] = useState(false);
  const place = ev.place.trim();
  const dd = dday(ev.startsAt, ev.endsAt);
  return (
    <section className="evhero" aria-label="일정 정보">
      {/* 홈 "다가오는 나의 일정" 카드와 같은 모양: 사진 위쪽 D-day·유형 라벨, 아래쪽 안에 일정명·날짜·위치 */}
      <div className={`evhero-card${ev.coverUrl ? "" : " none"}`}>
        {ev.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ev.coverUrl} alt="" />
        )}
        <span className="rail-badges">
          {dd && <span className="rail-dday">{dd}</span>}
          {ev.type && <span className="rail-type">{ev.club ? `${ev.type} · ${ev.club}` : ev.type}</span>}
          {/* 라벨 줄 오른쪽 끝(홈 카드의 "활동 바로가기" 자리): 참석 인원 */}
          {(ev.going ?? 0) > 0 && <span className="evhero-going">{ev.going}명 참석</span>}
        </span>
        <div className="evhero-text">
          <h1 className="evhero-title">{ev.name}</h1>
          <span className="evhero-line"><IconCalendar size={18} max={1.2} />{fmtRange(ev.startsAt, ev.endsAt)}</span>
          {place && (
            <button type="button" className="evhero-place" aria-haspopup="dialog" onClick={() => setMaps(true)} aria-label={`${place}, 지도에서 위치 찾기`}>
              <IconPlace size={18} /><span className="grow">{place}</span><IconNext size={16} />
            </button>
          )}
        </div>
      </div>
      {ev.club && <div className="small" style={{ padding: "0 2px" }}>클럽: {clubText(ev.club, ev.clubLeaders)}</div>}
      {children}

      <Popup id="event-map" open={maps} onClose={() => setMaps(false)} title="지도에서 위치 찾기" width={420}>
        <p className="small" style={{ margin: 0 }}>{place}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mapLinks(place).map((m) => (
            <a key={m.label} className="btn white" href={m.href} target="_blank" rel="noopener noreferrer" onClick={() => setMaps(false)}
              style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {m.label}에서 보기
            </a>
          ))}
        </div>
      </Popup>
    </section>
  );
}
