"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudiencePicker } from "@/components/AudiencePicker";
import { DateField } from "@/components/DateField";
import { PasswordField } from "@/components/PasswordField";
import { Popup } from "@/components/Popup";
import type { Audience } from "@/lib/audience";
import { api } from "@/lib/client";
import { EVENT_TYPES, isLight } from "@/lib/event-types";

const ALL: Audience = { mode: "all", events: [], clubs: [], memberIds: [] };

// 일정 페이지의 "+ 일정 만들기" 창. 만들면 그 일정의 관리 화면(/admin/events/[id])으로 가서 내용을 채운다.
// 관리자 비밀번호를 아직 확인하지 않았으면(서버가 403) 창 안에서 비밀번호를 받고 다시 만든다.
export function EventCreate({ open, onClose, clubs, unlocked }: { open: boolean; onClose: () => void; clubs: string[]; unlocked: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<string>("정기모임");
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [place, setPlace] = useState("");
  const [club, setClub] = useState("");
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
      type, name, pinned, startsAt, endsAt, place,
      ...(type === "소모임" ? { club } : { audience }),
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
    router.push(`/admin/events/${r.data.event.id}`);
  }

  return (
    <Popup id="new-event" title="일정 만들기" open={open} onClose={onClose} dirty={dirty}>
      <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="grid2">
          <div>
            <label className="l" htmlFor="n-type">유형</label>
            <select id="n-type" className="field" value={type} onChange={(e) => setType(e.target.value)}>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="l" htmlFor="n-name">일정 이름</label><input id="n-name" className="field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="l" htmlFor="n-start">시작 일시</label><DateField id="n-start" mode="datetime" value={startsAt} onChange={setStartsAt} /></div>
          <div><label className="l" htmlFor="n-end">끝나는 일시 (선택)</label><DateField id="n-end" mode="datetime" value={endsAt} onChange={setEndsAt} /></div>
          <div><label className="l" htmlFor="n-place">장소</label><input id="n-place" className="field" maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} /></div>
          {type === "소모임" && (
            <div>
              <label className="l" htmlFor="n-club">소모임</label>
              <select id="n-club" className="field" value={club} onChange={(e) => setClub(e.target.value)}>
                <option value="">소모임 고르기</option>
                {clubs.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
        {type === "소모임" ? (
          <span className="hint">모든 회원이 볼 수 있지만, 참석 신청은 고른 소모임 회원과 참관자만 할 수 있어요. 입금계좌는 소모임 계좌로 먼저 채워져요.</span>
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
          만들면 초안으로 시작하고 일정 관리 화면으로 이동해요. 내용을 채우고 “회원에게 전달”을 눌러야 회원에게 보여요.
          {type === "회의" ? " 회의 일정에는 회의록을 쓸 수 있어요." : isLight(type) ? "" : type !== "소모임" ? " 입금계좌는 모임회비관리의 계좌로 먼저 채워져요." : ""}
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
          disabled={busy || !name.trim() || (type === "소모임" && clubs.length > 0 && !club) || (needPass && !code) || (audience.mode !== "all" && type !== "소모임" && audience.memberIds.length === 0)}
          style={{ width: "auto", minWidth: 180, alignSelf: "flex-start" }}>
          {busy ? "만드는 중…" : "만들기"}
        </button>
      </form>
    </Popup>
  );
}
