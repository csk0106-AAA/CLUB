"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { MemberSearch } from "@/app/events/[id]/MemberSearch";
import { api, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Info = { intro: string; cycle: string; place: string; bank: string; account: string; holder: string; feeAmount: string; feeText: string; policy: string };
type M = { id: string; name: string; kind: string; position: string };
type Seat = M & { role: string };
type Data = { name: string; info: Info; roster: Seat[]; members: M[]; clubRoles: string[] };
type Note = { tone: "bad" | "info"; text: string } | null;

function Club({ name }: { name: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [roster, setRoster] = useState<Seat[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/clubs/${encodeURIComponent(name)}`);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setData(r.data);
    setRoster(r.data.roster);
    setInfo(r.data.info);
  }, [name]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data || !info) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const rosterDirty = JSON.stringify(roster.map((s) => [s.id, s.role])) !== JSON.stringify(data.roster.map((s) => [s.id, s.role]));
  const infoDirty = JSON.stringify(info) !== JSON.stringify(data.info);
  const setI = (k: keyof Info, v: string) => setInfo({ ...info, [k]: v });
  const leaders = roster.filter((s) => s.role);

  async function saveRoster() {
    setBusy(true);
    setNote(null);
    const r = await api<{ changed: number }>(`/api/admin/clubs/${encodeURIComponent(name)}/members`, {
      method: "PUT",
      body: { seats: roster.map((s) => ({ memberId: s.id, role: s.role })) },
    });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: `소모임 회원을 저장했어요.${r.data.changed ? ` 회원 ${r.data.changed}명의 명단에 반영했어요.` : ""}` });
    load();
  }

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const r = await api(`/api/admin/clubs/${encodeURIComponent(name)}`, { method: "PUT", body: info });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: "기본 정보를 저장했어요." });
    load();
  }

  return (
    <>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <Link href="/admin/clubs" className="mini" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>‹ 소모임 목록</Link>
        <h1 className="title grow" style={{ fontSize: fs(20) }}>{data.name}</h1>
        <span className="pill gray">회원 {data.roster.length}명</span>
      </div>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <section className="card" aria-label="소모임 회원" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>소모임 회원</b>
        <span className="small">
          직책(회장 등)을 정하면 그 회원이 소모임 행사의 참관자를 정할 수 있고 게시글도 쓸 수 있어요.
          {leaders.length > 0 && <> 지금: {leaders.map((l) => `${l.role} ${l.name}`).join(", ")}</>}
        </span>
        {roster.length === 0 && <span className="small">아직 회원이 없어요. 아래에서 더해 주세요.</span>}
        {roster.map((s) => (
          <div key={s.id} className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            <b className="grow" style={{ minWidth: 100 }}>{s.name} <span className="small">{[s.kind, s.position].filter(Boolean).join(" · ")}</span></b>
            <select className="field" style={{ width: "auto", minWidth: 120, minHeight: 44 }} aria-label={`${s.name} 소모임 직책`} value={s.role}
              onChange={(e) => setRoster(roster.map((x) => (x.id === s.id ? { ...x, role: e.target.value } : x)))}>
              <option value="">일반 회원</option>
              {[...new Set([...data.clubRoles, ...(s.role ? [s.role] : [])])].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="mini danger" type="button" onClick={() => setRoster(roster.filter((x) => x.id !== s.id))}>빼기</button>
          </div>
        ))}
        <MemberSearch
          label="회원 더하기"
          members={data.members.filter((m) => !roster.some((s) => s.id === m.id))}
          onPick={(m) => setRoster([...roster, { ...m, role: "" }])}
        />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className="grow" />
          {rosterDirty && <button className="mini" type="button" disabled={busy} onClick={() => setRoster(data.roster)}>되돌리기</button>}
          <button className="btn" type="button" style={{ width: "auto", minWidth: 140, minHeight: 46, fontSize: fs(15) }} disabled={busy || !rosterDirty} onClick={saveRoster}>
            {busy ? "저장 중…" : "회원 저장"}
          </button>
        </div>
      </section>

      <form className="card" aria-label="기본 정보" onSubmit={saveInfo} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>기본 정보</b>
        <div>
          <label className="l" htmlFor="c-intro">소개</label>
          <textarea id="c-intro" className="field" rows={3} maxLength={1000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }} value={info.intro} onChange={(e) => setI("intro", e.target.value)} />
        </div>
        <div className="grid2">
          <div><label className="l" htmlFor="c-cycle">모임 주기</label><input id="c-cycle" className="field" maxLength={100} placeholder="예) 매월 둘째 주 토요일" value={info.cycle} onChange={(e) => setI("cycle", e.target.value)} /></div>
          <div><label className="l" htmlFor="c-place">주요 장소</label><input id="c-place" className="field" maxLength={120} value={info.place} onChange={(e) => setI("place", e.target.value)} /></div>
        </div>
        <b>입금계좌</b>
        <div className="grid2">
          <div><label className="l" htmlFor="c-bank">은행</label><input id="c-bank" className="field" maxLength={40} placeholder="예) 국민은행" value={info.bank} onChange={(e) => setI("bank", e.target.value)} /></div>
          <div><label className="l" htmlFor="c-acc">계좌번호</label><input id="c-acc" className="field" maxLength={80} value={info.account} onChange={(e) => setI("account", e.target.value)} /></div>
          <div><label className="l" htmlFor="c-holder">예금주</label><input id="c-holder" className="field" maxLength={60} value={info.holder} onChange={(e) => setI("holder", e.target.value)} /></div>
        </div>
        <span className="small">이 소모임으로 행사를 만들면 이 계좌가 행사 입금계좌로 먼저 들어가요.</span>
        <b>소모임 회비 (선택)</b>
        <div className="grid2">
          <div><label className="l" htmlFor="c-fee">금액 (원)</label><input id="c-fee" className="field" inputMode="numeric" value={info.feeAmount} onChange={(e) => setI("feeAmount", e.target.value.replace(/\D/g, "").slice(0, 9))} /></div>
          <div><label className="l" htmlFor="c-feetext">회비 안내</label><input id="c-feetext" className="field" maxLength={200} placeholder="예) 연 1회, 3월에 걷어요" value={info.feeText} onChange={(e) => setI("feeText", e.target.value)} /></div>
        </div>
        {info.feeAmount && <span className="small">회비: {won(info.feeAmount)}{info.feeText ? ` · ${info.feeText}` : ""}</span>}
        <div>
          <label className="l" htmlFor="c-policy">운영 정책 (줄을 바꿔 여러 줄로 쓸 수 있어요)</label>
          <textarea id="c-policy" className="field" rows={6} maxLength={3000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
            placeholder={"예)\n불참 시 하루 전까지 회장에게 알려 주세요.\n회비는 그린피·식사비 실비로 정산해요."} value={info.policy} onChange={(e) => setI("policy", e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy || !infoDirty} style={{ width: "auto", minWidth: 180, alignSelf: "flex-start" }}>{busy ? "저장 중…" : "기본 정보 저장"}</button>
      </form>
    </>
  );
}

export default function ClubAdminPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    /* 그대로 */
  }
  return <AdminGate mode="clubs" need={["members"]} active="/admin/clubs"><Club name={decoded} /></AdminGate>;
}
