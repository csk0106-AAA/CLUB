"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateTime } from "@/lib/client";
import { DateField } from "./DateField";
import { NameSearch } from "./NameSearch";
import { Popup } from "./Popup";
import { fs } from "@/lib/fs";

type Dir = "go" | "back";
type Kind = "member" | "rental";
type LegInfo = { on: boolean; from: string; departAt: string; to: string; arriveAt: string; riders: string[]; seats: number; memo: string };
type Car = { id: string; name: string; plate: string; driverId: string; seats: number; kind: Kind; driverName: string; memo: string; ownerId: string; go: LegInfo; back: LegInfo };
type Req = { id: string; carId: string; dir: Dir; memberId: string; name: string; status: "pending" | "waiting" | "approved" | "confirmed"; label: string; createdAt: string; fromCar: string };
type Data = {
  published: boolean; open: boolean; waitUntil: string; requests: Req[];
  self: Record<Dir, string[]>; // 개별 이동(구간별)
  recruitOn: boolean; recruitUntil: string; recruitFrom: string; openFrom: string; // 차량모집·차량신청 시작·마감
  adminOnly: boolean; // 관리자배정
  members: { id: string; name: string }[]; attendingIds: string[];
  allMembers: { id: string; name: string }[]; // 운전자 검색용(참석하지 않는 회원도)
  cars: Car[]; free: Record<Dir, string[]>;
};
type Form = Omit<Car, "id" | "ownerId"> & { ownerId?: string };
type Setting = { open: boolean; waitUntil: string; recruitOn: boolean; recruitUntil: string; recruitFrom: string; openFrom: string; adminOnly: boolean };

const DIRS: Dir[] = ["go", "back"];
const LABEL: Record<Dir, string> = { go: "갈 때", back: "올 때" };
const emptyLeg = (): LegInfo => ({ on: true, from: "", departAt: "", to: "", arriveAt: "", riders: [], seats: 5, memo: "" });
const blank = (): Form => ({ name: "", plate: "", driverId: "", seats: 5, kind: "member", driverName: "", memo: "", go: emptyLeg(), back: emptyLeg() });
// 운전자가 차지하는 자리(회원 차량에 운전자가 정해져 있으면 1) — 서버 lib/carpool.ts driverSeat 와 같다
const driverSeat = (c: Pick<Car, "kind" | "driverId" | "driverName">) => (c.kind !== "rental" && c.driverId ? 1 : 0);
const legBody = (l: LegInfo) => ({ on: l.on, from: l.from, departAt: l.departAt, to: l.to, arriveAt: l.arriveAt, riders: l.on ? l.riders : [], seats: l.seats || 1, memo: l.memo });
const carBody = (c: Form) => ({ name: c.name, plate: c.plate, driverId: c.driverId, kind: c.kind, driverName: c.driverName, ownerId: c.ownerId ?? "", go: legBody(c.go), back: legBody(c.back) });
// 구간 좌석(없으면 차량 전체)
const legSeats = (c: { seats: number; go: LegInfo; back: LegInfo }, d: Dir) => c[d].seats || c.seats;

// 차량 정보 입력(등록·정보 수정 창이 함께 쓴다): 종류·운전자·그룹명·차량번호·좌석, 운행 구간과 구간별 장소·시간
function CarForm({ idp, v, set, members }: { idp: string; v: Form; set: (p: Partial<Form>) => void; members: { id: string; name: string }[] }) {
  // 회원 차량 운전자: 차량모집 지원 회원 / 다른 회원 / 회원 아닌 분(회원의 "차량모집 지원" 창과 같은 고르기)
  type Mode = "owner" | "member" | "other";
  const [mode, setMode] = useState<Mode>(() =>
    v.driverId && v.driverId === v.ownerId ? "owner" : v.driverId ? "member" : v.driverName ? "other" : v.ownerId ? "owner" : "member");
  const extDriver = v.kind === "member" && mode === "other";
  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === "owner") set({ driverId: v.ownerId ?? "", driverName: "" });
    else if (m === "member") set({ driverId: v.driverId && v.driverId !== v.ownerId ? v.driverId : "", driverName: "" });
    else set({ driverId: "" });
  };
  const setLeg = (dir: Dir, p: Partial<LegInfo>) => set({ [dir]: { ...v[dir], ...p } } as Partial<Form>);
  const toggle = (dir: Dir, on: boolean) => {
    const other = v[dir === "go" ? "back" : "go"];
    const cur = v[dir];
    setLeg(dir, on && !cur.from && !cur.to ? { on, from: other.to, to: other.from } : { on });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="seg" role="group" aria-label="차량 종류" style={{ alignSelf: "flex-start" }}>
        <button type="button" aria-pressed={v.kind === "member"} onClick={() => set({ kind: "member", driverName: "" })} style={{ minHeight: 38, padding: "0 14px" }}>회원 차량</button>
        <button type="button" aria-pressed={v.kind === "rental"} onClick={() => set({ kind: "rental", driverId: "" })} style={{ minHeight: 38, padding: "0 14px" }}>외부 대절</button>
      </div>
      <div className="grid2">
        {v.kind === "member" ? (
          <>
            {/* 차량모집 지원 회원: 회원 대신 먼저 등록할 때. 그 회원이 일정 화면에서 빈 칸을 채울 수 있고, 빈 칸이 있으면 알림이 가요 */}
            <div style={{ gridColumn: "1 / -1" }}><label className="l" htmlFor={`${idp}-ow`}>차량모집 지원 회원 <span style={{ color: "var(--brand)" }}>(필수)</span></label>
              <NameSearch id={`${idp}-ow`} members={members} value={v.ownerId ?? ""} onChange={(id) => set({ ownerId: id, ...(mode === "owner" ? { driverId: id, driverName: "" } : {}) })} /></div>
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="l" style={{ margin: 0 }}>운전자</span>
              <div className="seg" role="group" aria-label="운전자" style={{ alignSelf: "flex-start" }}>
                <button type="button" aria-pressed={mode === "owner"} disabled={!v.ownerId} title={v.ownerId ? undefined : "차량모집 지원 회원을 먼저 골라 주세요"} onClick={() => pickMode("owner")} style={{ minHeight: 36, padding: "0 12px" }}>지원 회원</button>
                <button type="button" aria-pressed={mode === "member"} onClick={() => pickMode("member")} style={{ minHeight: 36, padding: "0 12px" }}>다른 회원</button>
                <button type="button" aria-pressed={mode === "other"} onClick={() => pickMode("other")} style={{ minHeight: 36, padding: "0 12px" }}>회원 아닌 분</button>
              </div>
              {mode === "owner" && <span className="small">{v.ownerId ? `${members.find((m) => m.id === v.ownerId)?.name ?? "지원 회원"} 님이 운전해요.` : "차량모집 지원 회원을 먼저 골라 주세요."}</span>}
              {mode === "member" && <NameSearch id={`${idp}-dr`} members={members} value={v.driverId} onChange={(id) => set({ driverId: id })} />}
              {mode === "other" && <input id={`${idp}-dr`} className="field" aria-label="운전자 이름" maxLength={30} value={v.driverName} placeholder="운전자 이름 (예: 가족·지인)" onChange={(e) => set({ driverName: e.target.value })} />}
            </div>
          </>
        ) : (
          <div><label className="l" htmlFor={`${idp}-dr`}>운전자</label>
            <input id={`${idp}-dr`} className="field" maxLength={30} value={v.driverName} placeholder="예: 김기사 010-0000-0000" onChange={(e) => set({ driverName: e.target.value })} /></div>
        )}
        <div><label className="l" htmlFor={`${idp}-nm`}>그룹명</label><input id={`${idp}-nm`} className="field" maxLength={30} value={v.name} placeholder="비우면 차량번호 → 운전자 이름" onChange={(e) => set({ name: e.target.value })} /></div>
        <div><label className="l" htmlFor={`${idp}-pl`}>차량번호</label><input id={`${idp}-pl`} className="field" maxLength={20} value={v.plate} onChange={(e) => set({ plate: e.target.value })} /></div>
      </div>
      <div className="checks" role="group" aria-label="운행 구간">
        {DIRS.map((dir) => (
          <label key={dir}><input type="checkbox" checked={v[dir].on} onChange={(e) => toggle(dir, e.target.checked)} />{LABEL[dir]}</label>
        ))}
      </div>
      {DIRS.filter((dir) => v[dir].on).map((dir) => (
        <section key={dir} aria-label={`${LABEL[dir]} 일정`} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <b>{LABEL[dir]}</b>
          <div className="grid2">
            <div><label className="l" htmlFor={`${idp}-${dir}-fr`}>출발지</label><input id={`${idp}-${dir}-fr`} className="field" value={v[dir].from} onChange={(e) => setLeg(dir, { from: e.target.value })} /></div>
            <div><label className="l" htmlFor={`${idp}-${dir}-dp`}>출발 시간</label><DateField id={`${idp}-${dir}-dp`} mode="datetime" value={v[dir].departAt} onChange={(x) => setLeg(dir, { departAt: x })} /></div>
            <div><label className="l" htmlFor={`${idp}-${dir}-to`}>도착지</label><input id={`${idp}-${dir}-to`} className="field" value={v[dir].to} onChange={(e) => setLeg(dir, { to: e.target.value })} /></div>
            <div><label className="l" htmlFor={`${idp}-${dir}-ar`}>도착 예상 시간</label><DateField id={`${idp}-${dir}-ar`} mode="datetime" value={v[dir].arriveAt} onChange={(x) => setLeg(dir, { arriveAt: x })} /></div>
            <div><label className="l" htmlFor={`${idp}-${dir}-se`}>{v.kind === "rental" || extDriver ? "좌석 수(운전자 제외)" : "좌석 수 (운전자 포함)"}</label><input id={`${idp}-${dir}-se`} className="field" type="number" min={1} max={45} value={v[dir].seats || ""} onChange={(e) => setLeg(dir, { seats: Number(e.target.value) })} /></div>
            <div><label className="l" htmlFor={`${idp}-${dir}-mm`}>메모</label><input id={`${idp}-${dir}-mm`} className="field" maxLength={100} value={v[dir].memo} placeholder="예: 강남역 경유 가능" onChange={(e) => setLeg(dir, { memo: e.target.value })} /></div>
          </div>
        </section>
      ))}
    </div>
  );
}

// 차량 배정 보드: 갈 때/올 때 탭 → 차량 카드(요약 + 탑승자) + 맨 끝 "배정 대기"(차 없는 참석자).
// 이름을 끌어서 차에 놓거나 이름 옆 선택 상자로 옮기면 바로 저장된다. 회원 신청(승인 대기·대기)은 차 카드 안에서 승인·반려.
// 다 정했으면 "확정"을 눌러야 회원에게 알림이 가고 일정 화면에 보인다.
export function CarpoolPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/carpool`;
  const [d, setD] = useState<Data | null>(null);
  const [dir, setDir] = useState<Dir>("go");
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState("");
  // 눌러서 고른 사람(그다음 차 카드의 "넣기"를 누르면 옮겨진다). where: 지금 있는 차 id("" = 배정 대기)
  const [pick, setPick] = useState<{ mid: string; where: string } | null>(null);
  // "+ 회원": 참석자 명단에서 골라 이 차에 넣기(여러 명)
  const [adding, setAdding] = useState<{ carId: string; sel: string[]; q: string } | null>(null);
  // 등록·정보 수정 창
  const [form, setForm] = useState<{ id: string; v: Form } | null>(null);
  const [formErr, setFormErr] = useState("");
  // 회원 신청 설정(신청 받기·대기 기한)
  const [setting, setSetting] = useState<Setting | null>(null);
  const [showSetting, setShowSetting] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setD(r.data);
    setSetting({ open: r.data.open, waitUntil: r.data.waitUntil, recruitOn: r.data.recruitOn, recruitUntil: r.data.recruitUntil, recruitFrom: r.data.recruitFrom ?? "", openFrom: r.data.openFrom ?? "", adminOnly: !!r.data.adminOnly });
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  if (!d) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const nm = (id: string) => d.members.find((m) => m.id === id)?.name ?? "(지운 회원)";
  const driverOf = (c: Car) => (c.kind !== "rental" && c.driverId ? nm(c.driverId) : c.driverName);
  const shown = d.cars.filter((c) => c[dir].on);
  const reqOf = (carId: string, mid: string) => d.requests.find((q) => q.carId === carId && q.dir === dir && q.memberId === mid && (q.status === "approved" || q.status === "confirmed"));

  // 탑승자 옮기기: from/to 가 ""면 배정 대기. 빼는 차를 먼저 저장해야 "다른 차에 이미 있어요"에 걸리지 않는다.
  // 옮기기: to/from 이 ""면 배정 대기, "self"면 개별 이동, 그 밖에는 차 id
  async function move(mid: string, from: string, to: string) {
    if (!d || from === to) return;
    if (to === "self" || from === "self") {
      setBusy(true);
      setNote(null);
      setPick(null);
      // 개별 이동으로: 서버가 탄 차에서 빼고 개별 이동에 넣는다 / 개별 이동에서: 먼저 빼고(배정 대기), 차로 가면 이어서 넣는다
      const r = await api(`${base}/publish`, { body: { action: "self", memberId: mid, dir, on: to === "self" } });
      if (!r.ok) { setBusy(false); setNote({ tone: "bad", text: r.error }); return load(); }
      setBusy(false);
      if (to && to !== "self") return moveAfterLoad(mid, to);
      return load();
    }
    const target = d.cars.find((c) => c.id === to);
    if (target) {
      if (target.kind === "member" && target.driverId === mid) return setNote({ tone: "bad", text: `${nm(mid)} 님은 ${target.name}의 운전자예요.` });
      if (target[dir].riders.length + driverSeat(target) >= legSeats(target, dir)) return setNote({ tone: "bad", text: `${target.name}은(는) ${LABEL[dir]} 좌석 ${legSeats(target, dir)}개가 다 찼어요${driverSeat(target) ? "(운전자 포함)" : ""}. 다른 분을 빼거나 정보 수정에서 좌석을 늘려 주세요.` });
    }
    setBusy(true);
    setNote(null);
    setPick(null);
    const src = d.cars.find((c) => c.id === from);
    if (src) {
      const r = await api(`${base}/${src.id}`, { method: "PATCH", body: { [dir]: { riders: src[dir].riders.filter((x) => x !== mid) } } });
      if (!r.ok) { setBusy(false); setNote({ tone: "bad", text: r.error }); return load(); }
    }
    if (target) {
      const r = await api(`${base}/${target.id}`, { method: "PATCH", body: { [dir]: { riders: [...target[dir].riders, mid] } } });
      if (!r.ok) setNote({ tone: "bad", text: r.error });
    }
    setBusy(false);
    load();
  }
  // 개별 이동에서 꺼낸 뒤 차에 넣기(배정 대기 상태에서 옮기는 것과 같다)
  async function moveAfterLoad(mid: string, to: string) {
    const r = await api<Data>(base);
    if (!r.ok) return load();
    const target = r.data.cars.find((c) => c.id === to);
    if (target) {
      const p = await api(`${base}/${target.id}`, { method: "PATCH", body: { [dir]: { riders: [...target[dir].riders, mid] } } });
      if (!p.ok) setNote({ tone: "bad", text: p.error });
    }
    load();
  }
  async function addMany(carId: string, mids: string[]) {
    if (!d || mids.length === 0) return;
    const target = d.cars.find((c) => c.id === carId);
    if (!target) return;
    setBusy(true);
    setNote(null);
    for (const src of d.cars.filter((c) => c.id !== carId && c[dir].riders.some((m) => mids.includes(m)))) {
      const r = await api(`${base}/${src.id}`, { method: "PATCH", body: { [dir]: { riders: src[dir].riders.filter((m) => !mids.includes(m)) } } });
      if (!r.ok) { setBusy(false); setNote({ tone: "bad", text: r.error }); return load(); }
    }
    const r = await api(`${base}/${carId}`, { method: "PATCH", body: { [dir]: { riders: [...target[dir].riders, ...mids.filter((m) => !target[dir].riders.includes(m))] } } });
    setBusy(false);
    setNote(r.ok ? { tone: "info", text: `${target.name}에 ${mids.length}명을 넣었어요. 다 정했으면 “확정”을 눌러 주세요.` } : { tone: "bad", text: r.error });
    setAdding(null);
    load();
  }
  async function decide(reqId: string, action: "approve" | "reject") {
    if (action === "reject" && !window.confirm("이 신청을 반려할까요? 회원에게 알림이 가요.")) return;
    setBusy(true);
    const r = await api(`${base}/publish`, { body: { action, reqId } });
    setBusy(false);
    setNote(r.ok ? { tone: "info", text: action === "approve" ? "승인했어요. 탑승자에 넣었어요. 다 정했으면 아래 “확정”을 눌러 주세요." : "반려했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function act(action: "publish" | "unpublish" | "auto") {
    setBusy(true);
    const r = await api<{ added?: number; told?: number }>(`${base}/publish`, { body: { action } });
    setBusy(false);
    if (!r.ok) setNote({ tone: "bad", text: r.error });
    else setNote({ tone: "info", text: action === "auto" ? `빈 좌석에 ${r.data.added ?? 0}자리를 채웠어요. 확인하고 “확정”을 눌러 주세요.` : action === "publish" ? `확정했어요. ${r.data.told ?? 0}명에게 확정 알림을 보냈어요.` : "확정을 취소했어요. 확정됐던 분들은 \"확정 전\"으로 돌아갔어요. 다시 \"확정 (알림)\"을 누르면 다시 안내돼요." });
    load();
  }
  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.v.go.on && !form.v.back.on) return setFormErr("갈 때와 올 때 중 하나는 운행해야 해요.");
    if (form.v.kind === "member" && !form.v.ownerId) return setFormErr("회원 차량은 차량모집 지원 회원을 골라 주세요.");
    setFormErr("");
    const r = form.id === "new"
      ? await api(base, { body: carBody(form.v) })
      : await api(`${base}/${form.id}`, { method: "PATCH", body: carBody(form.v) });
    if (!r.ok) return setFormErr(r.error);
    setNote({ tone: "info", text: form.id === "new" ? "차량을 등록했어요. 이름을 끌어서 탑승자를 넣어 주세요." : "차량 정보를 저장했어요." });
    setForm(null);
    load();
  }
  async function remove(c: Car) {
    if (!window.confirm(`“${c.name}” 차량을 지울까요? 이 차의 신청도 함께 취소돼요.`)) return;
    const r = await api(`${base}/${c.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function saveSetting() {
    if (!setting) return;
    const r = await api(`${base}/publish`, { body: { action: "settings", ...setting } });
    setNote(r.ok ? { tone: "info", text: "저장했어요. 새로 시작한 모집·신청은 참석자에게 알림이 가요." } : { tone: "bad", text: r.error });
    load();
  }

  const targets = [...shown.map((c) => ({ key: c.id, label: c.name })), { key: "", label: "배정 대기" }, { key: "self", label: "개별 이동" }];
  // 이름 한 줄(끌어서 옮기기 + 선택 상자로 옮기기)
  const person = (mid: string, where: string) => {
    const q = where ? reqOf(where, mid) : undefined;
    return (
      <div key={mid} className={`car-person${pick?.mid === mid ? " picked" : ""}`} draggable={canEdit && !busy} onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${mid}|${where}`); e.dataTransfer.effectAllowed = "move"; }}>
        <button type="button" className="car-name" disabled={!canEdit || busy} aria-pressed={pick?.mid === mid} title="눌러서 고른 뒤 다른 차의 “넣기”를 누르면 옮겨요"
          onClick={() => setPick(pick?.mid === mid ? null : { mid, where })}>{nm(mid)}</button>
        {q?.status === "confirmed" && <span className="pill ok">확정</span>}
        {where && q?.status !== "confirmed" && <span className="pill warn">확정 전</span>}
        {canEdit && (
          <select aria-label={`${nm(mid)} 옮기기`} className="field car-move" value={where} disabled={busy} onChange={(e) => move(mid, where, e.target.value)}>
            {targets.map((t) => <option key={t.key || "pool"} value={t.key}>{t.label}</option>)}
          </select>
        )}
      </div>
    );
  };
  const drop = (key: string) => ({
    onDragOver: (e: React.DragEvent) => { if (canEdit) { e.preventDefault(); setOver(key || "pool"); } },
    onDragLeave: () => setOver(""),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(""); const [mid, from] = e.dataTransfer.getData("text/plain").split("|"); if (canEdit && mid) move(mid, from ?? "", key); },
  });
  const pending = d.requests.filter((q) => q.status === "pending").length;
  const unconfirmed = d.requests.filter((q) => q.status === "approved").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      {/* 한 줄: 차량신청설정(펼치기) · 차량모집 · 차량신청(체크하면 바로 표시) · (승인 대기) · + 차량 */}
      <div className="row car-top">
        {canEdit && (
          <button type="button" className="mini" aria-expanded={showSetting} onClick={() => setShowSetting(!showSetting)}>
            차량신청설정 <span aria-hidden="true">{showSetting ? "▴" : "▾"}</span>
          </button>
        )}
        {/* 차량신청설정의 체크(저장 전이라도)를 그대로 보여 준다 */}
        {(setting ?? d).recruitOn && <span className="pill blue">차량모집</span>}
        {(setting ?? d).open && <span className="pill blue">차량신청</span>}
        {(setting ?? d).adminOnly && <span className="pill blue">관리자배정</span>}
        {!(setting ?? d).recruitOn && !(setting ?? d).open && !(setting ?? d).adminOnly && <span className="pill gray">신청 안 받음</span>}
        {pending > 0 && <span className="pill blue">승인 대기 {pending}</span>}
        <span className="grow" />
        {canEdit && <button type="button" className="btn" style={{ width: "auto", minHeight: 38, padding: "0 14px", fontSize: fs(14), flex: "none" }} onClick={() => { setFormErr(""); setForm({ id: "new", v: blank() }); }}>+ 차량</button>}
      </div>
      {canEdit && showSetting && setting && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
          {/* 차량모집 · 마감 일시(오른쪽) */}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div className="checks"><label><input type="checkbox" checked={setting.recruitOn} disabled={setting.adminOnly} onChange={(e) => setSetting({ ...setting, recruitOn: e.target.checked })} />차량모집</label></div>
            <span className="grow" />
            {/* 시작 ~ 마감(시작을 비우면 저장하는 순간부터) */}
            <div className="cp-range">
              <div aria-label="차량모집 시작 일시"><DateField id="cp-rec-from" mode="datetime" ariaLabel="차량모집 시작" value={setting.recruitFrom} onChange={(v) => setSetting({ ...setting, recruitFrom: v })} /></div>
              <span aria-hidden="true">~</span>
              <div aria-label="차량모집 마감 일시"><DateField id="cp-rec" mode="datetime" ariaLabel="차량모집 마감" value={setting.recruitUntil} onChange={(v) => setSetting({ ...setting, recruitUntil: v })} /></div>
            </div>
          </div>
          <span className="small">켜면 참석자에게 알림이 가고, 차를 가져오실 분이 일정 화면 “내 차로 지원하기”로 직접 등록해요(운전자·좌석·출발지·메모). 시작을 비우면 저장하는 순간부터예요. 차량신청을 따로 켜지 않으면 차량모집 마감 때 차량신청이 열려요.</span>
          {/* 차량신청 · 시작~마감 일시(오른쪽). 확정은 관리자가 "확정(알림)" */}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="checks"><label><input type="checkbox" checked={setting.open} disabled={setting.adminOnly} onChange={(e) => setSetting({ ...setting, open: e.target.checked })} />차량신청</label></div>
            <span className="grow" />
            <div className="cp-range">
              <div aria-label="차량신청 시작 일시"><DateField id="cp-open-from" mode="datetime" ariaLabel="차량신청 시작" value={setting.openFrom} onChange={(v) => setSetting({ ...setting, openFrom: v })} /></div>
              <span aria-hidden="true">~</span>
              <div aria-label="차량신청 마감 일시"><DateField id="cp-wait" mode="datetime" ariaLabel="차량신청 마감" value={setting.waitUntil} onChange={(v) => setSetting({ ...setting, waitUntil: v })} /></div>
            </div>
          </div>
          <span className="small">승인 없이 자리가 있으면 바로 배정되고, 정원이 차면 대기로 받아요. 자리가 나면 대기 1번이 자동으로 들어가요. 마감 시각이 되면 신청이 닫히고 관리자에게 알림이 가요. <b>최종 확정은 아래 “확정 (알림)”</b>을 눌러야 탑승자·운전자에게 안내돼요(일정 3일 전까지 확정하지 않으면 다시 알려 드려요). 차량모집 마감 전에 시작하면 그때까지 등록된 차로 먼저 받고, 나중에 등록되는 차는 바로 더해지고 차 없는 참석자에게 알림이 가요.</span>
          {/* 관리자배정: 차량모집·차량신청 없이 관리자가 모두 등록·배정(켜면 둘은 꺼지고 누를 수 없어요) */}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="checks"><label><input type="checkbox" checked={setting.adminOnly}
              onChange={(e) => setSetting({ ...setting, adminOnly: e.target.checked, ...(e.target.checked ? { recruitOn: false, open: false } : {}) })} />관리자배정</label></div>
          </div>
          <span className="small">차량모집·차량신청 없이 관리자가 차량을 모두 등록하고 배정해요. 회원에게는 “관리자가 차량을 배정 중입니다”가 보이고, “확정 (알림)”을 누르면 배정 정보가 보여요.</span>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" style={{ width: "auto", minHeight: 42, fontSize: fs(14) }}
              disabled={setting.open === d.open && setting.waitUntil === d.waitUntil && setting.recruitOn === d.recruitOn && setting.recruitUntil === d.recruitUntil && setting.recruitFrom === (d.recruitFrom ?? "") && setting.openFrom === (d.openFrom ?? "") && setting.adminOnly === !!d.adminOnly} onClick={saveSetting}>저장</button>
          </div>
        </div>
      )}

      {/* 배정 방법 안내 */}
      {canEdit && d.cars.length > 0 && (
        <div className="msg info" style={{ fontSize: fs(13) }}>
          <b>관리자가 직접 배정할 때</b> · 위 “배정 대기”의 이름을 <b>눌러서 고른 뒤 차 카드의 “넣기”</b>를 누르거나, 이름을 <b>끌어서 차 카드에 놓으면</b> 바로 저장돼요(명단은 스크롤해도 위에 붙어 있어요). 회원이 신청하면 자리가 있을 때 바로 배정돼요. 다 정했으면 맨 아래 <b>“확정 (알림)”</b>을 눌러야 탑승자·운전자에게 확정 안내가 가요.
        </div>
      )}

      {d.cars.length === 0 ? (
        <div className="msg info">등록된 차량이 없어요. 오른쪽 위 “+ 차량”으로 차량을 등록해 주세요.</div>
      ) : (
        <>
          {/* 갈 때/올 때 탭 · 오른쪽에 확정 상태 */}
          <div className="row" style={{ gap: 8 }}>
          <div className="seg" role="tablist" aria-label="구간" style={{ flex: "none" }}>
            {DIRS.map((x) => (
              <button key={x} type="button" role="tab" aria-selected={dir === x} aria-pressed={dir === x} onClick={() => setDir(x)} style={{ minHeight: 40, padding: "0 16px" }}>
                {/* 갈 때 N명(차에 배정된 사람: 탑승자 + 회원 운전자) · 대기 N명 */}
                {LABEL[x]} {d.cars.filter((c) => c[x].on).reduce((n, c) => n + c[x].riders.length + driverSeat(c), 0)}명 <span className="small">· 대기 {d.free[x].length}명</span>
              </button>
            ))}
          </div>
            <span className="grow" />
            <span className={`pill ${d.published ? "ok" : "warn"}`} style={{ flex: "none" }}>{d.published ? "확정됨" : "확정 전"}</span>
          </div>
          {shown.length === 0 && <div className="msg info">{LABEL[dir]} 운행하는 차량이 없어요.</div>}
          {/* 배정 대기: 이 구간에 아직 차가 없는 참석자. 스크롤해도 화면 위에 붙어 있어 아래 차에도 끌어 놓을 수 있다 */}
          <div className="car-pool-bar" {...drop("")} style={{ borderColor: over === "pool" ? "var(--blue)" : undefined, background: over === "pool" ? "var(--blue-bg)" : undefined }}>
            <div className="row" style={{ gap: 6 }}>
              <b>배정 대기 {d.free[dir].length}명</b>
              <span className="small grow">{LABEL[dir]} 차가 없는 참석자</span>
              {pick && <span className="small" style={{ fontWeight: 700 }}>{nm(pick.mid)} 고름 · 차의 “넣기”를 누르세요</span>}
              {pick && <button type="button" className="mini" onClick={() => setPick(null)}>고르기 취소</button>}
              {canEdit && pick && pick.where && <button type="button" className="mini" disabled={busy} onClick={() => move(pick.mid, pick.where, "")}>{pick.where === "self" ? "개별 이동 취소" : "배정 대기로 빼기"}</button>}
            </div>
            <div className="car-chips">
              {d.free[dir].map((mid) => (
                <button key={mid} type="button" className={`car-chip${pick?.mid === mid ? " on" : ""}`} draggable={canEdit && !busy} disabled={!canEdit || busy}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${mid}|`); e.dataTransfer.effectAllowed = "move"; }}
                  aria-pressed={pick?.mid === mid} onClick={() => setPick(pick?.mid === mid ? null : { mid, where: "" })}>{nm(mid)}</button>
              ))}
              {d.free[dir].length === 0 && <span className="hint">모두 배정됐어요</span>}
            </div>
            {/* 개별 이동: 차를 타지 않고 각자 가는 분. 끌어서 넣고 빼요(회원도 카풀 칸에서 직접 고르고 취소할 수 있어요) */}
            <div className={`car-self${over === "self" ? " over" : ""}`} {...drop("self")}>
              <div className="row" style={{ gap: 6 }}>
                <b>개별 이동 {(d.self?.[dir] ?? []).length}명</b>
                <span className="small grow">{LABEL[dir]} 차 없이 각자 이동</span>
                {canEdit && pick && pick.where !== "self" && <button type="button" className="mini" disabled={busy} onClick={() => move(pick.mid, pick.where, "self")}>개별 이동으로</button>}
              </div>
              <div className="car-chips">
                {(d.self?.[dir] ?? []).map((mid) => (
                  <button key={mid} type="button" className={`car-chip self${pick?.mid === mid ? " on" : ""}`} draggable={canEdit && !busy} disabled={!canEdit || busy}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${mid}|self`); e.dataTransfer.effectAllowed = "move"; }}
                    aria-pressed={pick?.mid === mid} onClick={() => setPick(pick?.mid === mid ? null : { mid, where: "self" })}>{nm(mid)}</button>
                ))}
                {(d.self?.[dir] ?? []).length === 0 && <span className="hint">여기로 끌어 놓으면 개별 이동이에요</span>}
              </div>
            </div>
          </div>
          <div className="cards">
            {shown.map((c) => {
              const leg = c[dir];
              const used = leg.riders.length + driverSeat(c); // 회원 차량은 운전자 포함
              const full = used >= legSeats(c, dir);
              const rq = d.requests.filter((q) => q.carId === c.id && q.dir === dir && (q.status === "pending" || q.status === "waiting"));
              const waits = rq.filter((q) => q.status === "waiting");
              return (
                <div key={c.id} className="card car-card" {...drop(c.id)} style={{ borderColor: over === c.id ? "var(--blue)" : undefined, background: over === c.id ? "var(--blue-bg)" : undefined }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b className="grow" style={{ font: `700 ${fs(16)} var(--display)`, minWidth: 0 }}>{c.name}</b>
                    <span className={`pill ${full ? "ok" : "blue"}`}>{used}/{legSeats(c, dir)}석</span>
                  </div>
                  <span className="small">
                    {[c.kind === "rental" ? "외부 대절" : "회원 차량", c.kind === "rental" && driverOf(c) && `운전 ${driverOf(c)}`, c.plate].filter(Boolean).join(" · ")}
                    {c.ownerId && c.ownerId !== c.driverId && <><br />지원 {nm(c.ownerId)}(운전 {driverOf(c) || "미정"})</>}
                    {c.ownerId && c.ownerId === c.driverId && <><br />차량모집 지원 · {nm(c.ownerId)}</>}
                    {(leg.from || leg.to) && <><br />{`${leg.from || "?"} → ${leg.to || "?"}`}</>}
                    {/* 출발 시간은 한 줄 아래로 */}
                    {leg.departAt && <><br />{fmtDateTime(leg.departAt)} 출발</>}
                    {leg.memo && <><br />메모 · {leg.memo}</>}
                  </span>
                  {canEdit && pick && pick.where !== c.id && (
                    <button type="button" className="btn car-put" disabled={busy || full} onClick={() => move(pick.mid, pick.where, c.id)}>
                      {full ? "자리 없음" : `+ ${nm(pick.mid)} 넣기`}
                    </button>
                  )}
                  {/* 회원 차량 운전자: 처음부터 배정된 상태(옮길 수 없음 — 바꾸려면 정보 수정) */}
                  {c.kind !== "rental" && driverOf(c) && (
                    <div className="car-person driver" title="운전자는 정보 수정에서 바꿔요">
                      <span className="grow" style={{ fontWeight: 700, minWidth: 0 }}>{driverOf(c)}{!c.driverId && <span className="small"> (외부)</span>}</span>
                      <span className="pill blue">운전</span>
                    </div>
                  )}
                  {leg.riders.map((mid) => person(mid, c.id))}
                  {leg.riders.length === 0 && <span className="hint">이름을 골라 “넣기”를 누르거나 끌어 놓으세요</span>}
                  {/* 회원 신청: 신청(승인·반려) · 대기(순번) */}
                  {rq.length > 0 && (
                    <div className="car-reqs" aria-label={`${c.name} 회원 신청`}>
                      {rq.map((q) => (
                        <div key={q.id} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          <span className={`pill ${q.status === "pending" ? "blue" : "gray"}`}>{q.status === "pending" ? "신청" : `대기 ${waits.indexOf(q) + 1}번`}</span>
                          <span className="grow" style={{ fontWeight: 700 }}>{q.name}{q.fromCar && <span className="small"> · {q.fromCar}에서 변경</span>}</span>
                          {canEdit && q.status === "pending" && <button type="button" className="mini" disabled={busy} onClick={() => decide(q.id, "approve")}>승인</button>}
                          {canEdit && <button type="button" className="mini danger" disabled={busy} onClick={() => decide(q.id, "reject")} aria-label={`${q.name} 반려`}>반려</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className="row" style={{ gap: 6 }}>
                      {/* 왼쪽: 참석자 명단에서 골라 넣기(끌어 넣기도 그대로) */}
                      <button type="button" className="mini" disabled={busy || full} onClick={() => setAdding({ carId: c.id, sel: [], q: "" })} title={full ? "자리가 없어요" : "참석자 명단에서 골라 넣어요"}>+ 회원</button>
                      <span className="grow" />
                      <button type="button" className="mini" onClick={() => { setFormErr(""); setForm({ id: c.id, v: { ...c, driverName: c.driverName ?? "", memo: c.memo ?? "", go: { ...c.go, seats: legSeats(c, "go"), memo: c.go.memo ?? "" }, back: { ...c.back, seats: legSeats(c, "back"), memo: c.back.memo ?? "" } } }); }}>정보 수정</button>
                      <button type="button" className="mini danger" onClick={() => remove(c)}>지우기</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canEdit && (
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <button className="btn white" type="button" disabled={busy} style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={() => act("auto")}>빈 좌석 자동 배정</button>
              <span className="grow" />
              {d.published && <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minHeight: 48, fontSize: fs(15) }} onClick={() => { if (window.confirm("확정을 취소할까요?\n확정된 분들에게 취소 알림이 가고 “확정 전”으로 돌아가요. 자리는 그대로이고, 다시 “확정 (알림)”을 누르면 다시 안내돼요.")) act("unpublish"); }}>확정 취소</button>}
              <button className="btn" type="button" disabled={busy} style={{ width: "auto", minHeight: 48, fontSize: fs(15), minWidth: 160 }} onClick={() => act("publish")}>
                {`확정 (알림)${unconfirmed ? ` · 확정 전 ${unconfirmed}명` : ""}`}
              </button>
            </div>
          )}
          {canEdit && <span className="small">“확정 전” 표시가 있는 분은 아직 회원에게 확정 알림이 가지 않았어요. “확정 (알림)”을 누르면 확정되고, 탑승자·운전자에게 종 알림이 가요. 확정한 뒤 바꾼 배정은 다시 누르면 바뀐 분들에게 알려요.</span>}
        </>
      )}

      {/* + 회원: 참석자 명단에서 고르기(차 없는 분 먼저, 다른 차에 탄 분은 고르면 이 차로 옮겨요) */}
      {(() => {
        const car = adding ? d.cars.find((c) => c.id === adding.carId) : undefined;
        if (!adding || !car) return null;
        const room = legSeats(car, dir) - driverSeat(car) - car[dir].riders.length;
        const where = (mid: string) => d.cars.find((c) => c.id !== car.id && c[dir].riders.includes(mid));
        const isDriver = (mid: string) => d.cars.some((c) => c.kind !== "rental" && c.driverId === mid && c[dir].on);
        const list = d.attendingIds
          .filter((mid) => !car[dir].riders.includes(mid) && !isDriver(mid))
          .filter((mid) => !adding.q.trim() || nm(mid).includes(adding.q.trim()))
          .sort((a, b) => Number(!!where(a)) - Number(!!where(b)) || nm(a).localeCompare(nm(b), "ko"));
        const toggle = (mid: string) => setAdding((x) => x && ({ ...x, sel: x.sel.includes(mid) ? x.sel.filter((y) => y !== mid) : x.sel.length >= room ? x.sel : [...x.sel, mid] }));
        return (
          <Popup id="carpool-add" width={480} title={`${car.name} · ${LABEL[dir]} 회원 넣기`} open onClose={() => setAdding(null)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="small">남은 자리 {room}석 · {adding.sel.length}명 골랐어요</span>
              <input className="field" placeholder="이름으로 찾기" aria-label="이름으로 찾기" value={adding.q} onChange={(e) => setAdding({ ...adding, q: e.target.value })} />
              <div className="car-add-list">
                {list.map((mid) => {
                  const o = where(mid);
                  const on = adding.sel.includes(mid);
                  return (
                    <label key={mid} className={`car-add-row${on ? " on" : ""}`}>
                      <input type="checkbox" checked={on} disabled={!on && adding.sel.length >= room} onChange={() => toggle(mid)} />
                      <span className="grow" style={{ fontWeight: 700 }}>{nm(mid)}</span>
                      <span className="small">{o ? `${o.name} 탑승 중` : "차 없음"}</span>
                    </label>
                  );
                })}
                {list.length === 0 && <span className="hint">넣을 수 있는 참석자가 없어요</span>}
              </div>
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn white" style={{ width: "auto", minWidth: 90 }} onClick={() => setAdding(null)}>취소</button>
                <button type="button" className="btn" style={{ width: "auto", minWidth: 120 }} disabled={busy || adding.sel.length === 0} onClick={() => addMany(car.id, adding.sel)}>{adding.sel.length ? `${adding.sel.length}명 넣기` : "넣기"}</button>
              </div>
            </div>
          </Popup>
        );
      })()}

      <Popup id="carpool-form" width={720} title={form?.id === "new" ? "차량등록" : "차량 정보 수정"} open={!!form} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {formErr && <div className="msg bad" role="alert">{formErr}</div>}
            <CarForm idp={form.id === "new" ? "nc" : `ec-${form.id}`} v={form.v} set={(p) => setForm((f) => (f ? { ...f, v: { ...f.v, ...p } } : f))} members={d.allMembers ?? d.members} />
            <button className="btn" type="submit" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }}>{form.id === "new" ? "차량등록" : "저장"}</button>
          </form>
        )}
      </Popup>
    </div>
  );
}
