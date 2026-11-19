"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudiencePicker } from "@/components/AudiencePicker";
import { DateField } from "@/components/DateField";
import { PasswordField } from "@/components/PasswordField";
import { Popup } from "@/components/Popup";
import type { Audience } from "@/lib/audience";
import { clubLabel } from "@/lib/club-label";
import { api } from "@/lib/client";
import { EVENT_TYPES, isLight } from "@/lib/event-types";

const ALL: Audience = { mode: "all", events: [], clubs: [], memberIds: [] };

// 일정 페이지의 "+ 일정 만들기" 창. 만들면 그 일정의 관리 화면(/admin/events/[id])으로 가서 내용을 채운다.
// fixedClub 을 주면(클럽관리 › 클럽 › 클럽일정관리) 그 클럽 일정만 만든다.
// clubs 를 주면(회원 "일정" 화면) 유형에 "클럽"도 있고 클럽을 고른다. 관리자 › 일정관리는 clubs 없이 써서 클럽 일정을 만들지 않는다.
// 관리자 비밀번호를 아직 확인하지 않았으면(서버가 403) 창 안에서 비밀번호를 받고 다시 만든다.
// allowed: 만들 수 있는 일정 종류(일정 만들기 권한 evMain·evClub). 주지 않으면 모든 종류.
export function EventCreate({ open, onClose, unlocked, fixedClub, clubs, allowed }: { open: boolean; onClose: () => void; clubs?: string[]; unlocked: boolean; fixedClub?: string; allowed?: string[] | null }) {
  const router = useRouter();
  const types = (clubs ? [...EVENT_TYPES] : EVENT_TYPES.filter((t) => t !== "클럽")).filter((t) => !allowed || allowed.includes(t));
  const [type, setType] = useState<string>(fixedClub ? "클럽" : types[0] ?? "정기모임");
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [place, setPlace] = useState("");
  const [photoLimit, setPhotoLimit] = useState(""); // 사진첩 최대 장수(비우면 참석 인원 × 10장 × 일정 일수)
  const [pickedClub, setPickedClub] = useState("");
  const club = fixedClub ?? pickedClub;
  const [pinned, setPinned] = useState(false);
  const [audience, setAudience] = useState<Audience>(ALL);
  const [needPass, setNeedPass] = useState(!unlocked);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const dirty = !!(name.trim() || startsAt || place.trim());

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    if (needPass) {
      const u = await api("/api/auth/admin", { body: { passcode: code } });
      if (!u.ok) {
        setBusy(false);
        return setErr(u.error);
      }
      setCode("");
      setNeedPass(false);
    }
    const body = {
      type, name, pinned, startsAt, endsAt, place, photoLimit,
      ...(type === "클럽" ? { club } : { audience }),
    };
    const r = await api<{ event: { id: string } }>("/api/admin/events", { body });
    if (!r.ok) {
      setBusy(false);
      // 관리자 비밀번호 확인이 풀렸거나 아직이면: 창 안에서 받는다
      if (r.status === 403 && !needPass) {
        setNeedPass(true);
        return setErr("관리자 비밀번호를 확인한 뒤에 만들 수 있어요. 비밀번호를 입력하고 다시 “만들기”를 눌러 주세요.");
      }
      return setErr(r.error);
    }
    router.push(`/admin/events/${r.data.event.id}${club ? `?club=${encodeURIComponent(club)}` : ""}`);
  }

  return (
    <Popup id="new-event" title={fixedClub ? `${fixedClub} 일정 만들기` : "일정 만들기"} open={open} onClose={onClose} dirty={dirty}>
      <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="grid2">
          {!fixedClub && (
            <div>
              <label className="l" htmlFor="n-type">유형</label>
              <select id="n-type" className="field" value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          )}
          <div><label className="l" htmlFor="n-name">일정 이름</label><input id="n-name" className="field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="l" htmlFor="n-start">시작 일시</label><DateField id="n-start" mode="datetime" value={startsAt} onChange={setStartsAt} /></div>
          <div><label className="l" htmlFor="n-end">끝나는 일시 (선택)</label><DateField id="n-end" mode="datetime" value={endsAt} onChange={setEndsAt} /></div>
          <div><label className="l" htmlFor="n-place">장소</label><input id="n-place" className="field" maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} /></div>
          <div>
            <label className="l" htmlFor="n-photos">사진 최대 장수 (선택)</label>
            <input id="n-photos" className="field" inputMode="numeric" maxLength={4} placeholder="비우면 참석 인원 × 10장 × 일수" value={photoLimit} onChange={(e) => setPhotoLimit(e.target.value.replace(/\D/g, ""))} />
          </div>
          {!fixedClub && clubs && type === "클럽" && (
            <div>
              <label className="l" htmlFor="n-club">클럽</label>
              <select id="n-club" className="field" value={pickedClub} onChange={(e) => setPickedClub(e.target.value)}>
                <option value="">클럽 고르기</option>
                {clubs.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
        {type === "클럽" ? (
          <span className="hint">모든 회원이 볼 수 있지만, 참석 신청은 {club ? clubLabel(club) : "고른 클럽"} 회원과 참관자만 할 수 있어요. 클럽 회원이 아니면 “{club ? clubLabel(club) : "○○ 모임"} 신청하러 가기”가 보여요. 입금계좌는 {club ? clubLabel(club) : "그 클럽"} 회비관리의 계좌로 먼저 채워져요.</span>
        ) : (
          <AudiencePicker value={audience} onChange={setAudience} legend="누구에게 보일까요?" />
        )}
        <div className="checks">
          <label htmlFor="n-pin">
            <input id="n-pin" type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            회원 일정 목록 맨 위에 고정
          </label>
        </div>
        <span className="small">
          만들면 공개전 상태로 시작하고 일정 관리 화면으로 이동해요. 내용을 채우고 “공개 및 회원전달”을 눌러야 회원에게 보여요.
          {type === "회의" ? " 회의 일정에는 회의록을 쓸 수 있어요." : isLight(type) ? "" : type !== "클럽" ? " 입금계좌는 모임회비관리의 계좌로 먼저 채워져요." : ""}
        </span>
        {needPass && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--soft)" }}>
            <label className="l" htmlFor="n-pc" style={{ margin: 0 }}>관리자 비밀번호</label>
            <PasswordField id="n-pc" autoComplete="current-password" value={code} onChange={setCode} />
            <span className="hint">일정을 만들려면 관리자 비밀번호를 한 번 확인해요.</span>
          </div>
        )}
        {err && <div className="msg bad" role="alert">{err}</div>}
        <button className="btn" type="submit"
          disabled={busy || !name.trim() || (type === "클럽" && !club) || (needPass && !code) || (audience.mode !== "all" && type !== "클럽" && audience.memberIds.length === 0)}
          style={{ width: "auto", minWidth: 180, alignSelf: "flex-start" }}>
          {busy ? "만드는 중…" : "만들기"}
        </button>
      </form>
    </Popup>
  );
}
