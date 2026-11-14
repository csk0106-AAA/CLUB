"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { DateField } from "./DateField";
import { Popup } from "./Popup";

type Dir = "go" | "back";
type LegInfo = { on: boolean; from: string; departAt: string; to: string; arriveAt: string; riders: string[] };
type Car = { id: string; name: string; plate: string; driverId: string; seats: number; go: LegInfo; back: LegInfo };
type Data = {
  published: boolean; members: { id: string; name: string }[]; attendingIds: string[];
  cars: Car[]; free: Record<Dir, string[]>;
};

const DIRS: Dir[] = ["go", "back"];
const LABEL: Record<Dir, string> = { go: "갈 때", back: "올 때" };
const legPill = (c: { go: { on: boolean }; back: { on: boolean } }) =>
  c.go.on && c.back.on ? "왕복" : c.go.on ? "갈 때만" : c.back.on ? "올 때만" : "운행 안 함";
const emptyLeg = (): LegInfo => ({ on: true, from: "", departAt: "", to: "", arriveAt: "", riders: [] });
const legBody = (l: LegInfo) => ({ on: l.on, from: l.from, departAt: l.departAt, to: l.to, arriveAt: l.arriveAt, riders: l.on ? l.riders : [] });

// 구간 일정 입력칸: 출발지 / 출발 시간 / 도착지 / 도착 시간
function LegFields({ idp, leg, disabled, onChange }: { idp: string; leg: LegInfo; disabled?: boolean; onChange: (p: Partial<LegInfo>) => void }) {
  return (
    <div className="grid2">
      <div><label className="l" htmlFor={`${idp}-fr`}>출발지</label><input id={`${idp}-fr`} className="field" value={leg.from} disabled={disabled} onChange={(e) => onChange({ from: e.target.value })} /></div>
      <div><label className="l" htmlFor={`${idp}-dp`}>출발 시간</label><DateField id={`${idp}-dp`} mode="datetime" value={leg.departAt} disabled={disabled} onChange={(v) => onChange({ departAt: v })} /></div>
      <div><label className="l" htmlFor={`${idp}-to`}>도착지</label><input id={`${idp}-to`} className="field" value={leg.to} disabled={disabled} onChange={(e) => onChange({ to: e.target.value })} /></div>
      <div><label className="l" htmlFor={`${idp}-ar`}>도착 예상 시간</label><DateField id={`${idp}-ar`} mode="datetime" value={leg.arriveAt} disabled={disabled} onChange={(v) => onChange({ arriveAt: v })} /></div>
    </div>
  );
}

// 운행 구간 선택: 갈 때 운행 / 올 때 운행 (둘 다면 왕복)
function LegToggles({ idp, go, back, disabled, onToggle }: { idp: string; go: boolean; back: boolean; disabled?: boolean; onToggle: (d: Dir, on: boolean) => void }) {
  return (
    <div className="checks" role="group" aria-label="운행 구간">
      {DIRS.map((d) => (
        <label key={d} htmlFor={`${idp}-${d}`}>
          <input id={`${idp}-${d}`} type="checkbox" checked={d === "go" ? go : back} disabled={disabled} onChange={(e) => onToggle(d, e.target.checked)} />
          {LABEL[d]} 운행
        </label>
      ))}
    </div>
  );
}

const legBox: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, borderTop: "2px solid var(--line)", paddingTop: 10 };

// 카풀 배정: 차량마다 갈 때·올 때 운행 여부를 고르고, 구간별 일정과 탑승자를 정한다. 확인을 눌러야 회원에게 배포된다.
export function CarpoolPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/carpool`;
  const [d, setD] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, Car>>({});
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const blank = () => ({ name: "", plate: "", driverId: "", seats: 4, go: emptyLeg(), back: emptyLeg() });
  const [nu, setNu] = useState(blank);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<Data>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setD(r.data);
    setDraft(Object.fromEntries(r.data.cars.map((c) => [c.id, { ...c, go: { ...c.go }, back: { ...c.back } }])));
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const nm = (id: string) => d?.members.find((m) => m.id === id)?.name ?? "";
  const set = (id: string, patch: Partial<Car>) => setDraft((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  const setLeg = (id: string, dir: Dir, patch: Partial<LegInfo>) => setDraft((x) => ({ ...x, [id]: { ...x[id], [dir]: { ...x[id][dir], ...patch } } }));
  // 올 때를 새로 켜면 비어 있는 출발지·도착지를 갈 때의 반대로 채워 준다.
  const toggled = (c: { go: LegInfo; back: LegInfo }, dir: Dir, on: boolean): Partial<LegInfo> => {
    const other = c[dir === "go" ? "back" : "go"];
    const cur = c[dir];
    return on && !cur.from && !cur.to ? { on, from: other.to, to: other.from } : { on };
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!nu.go.on && !nu.back.on) return setErr("갈 때와 올 때 중 하나는 운행해야 해요.");
    setErr("");
    const r = await api(base, { body: { name: nu.name, plate: nu.plate, driverId: nu.driverId, seats: nu.seats, go: legBody(nu.go), back: legBody(nu.back) } });
    if (!r.ok) return setErr(r.error);
    setNote({ tone: "info", text: "차량을 등록했어요. 아래 카드에서 탑승자를 정해 주세요." });
    setNu(blank());
    setOpen(false);
    load();
  }
  async function save(id: string) {
    const c = draft[id];
    const r = await api(`${base}/${id}`, { method: "PATCH", body: { name: c.name, plate: c.plate, driverId: c.driverId, seats: c.seats, go: legBody(c.go), back: legBody(c.back) } });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(id: string) {
    if (!window.confirm("이 차량을 지울까요?")) return;
    const r = await api(`${base}/${id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function act(action: "publish" | "unpublish" | "auto") {
    const r = await api<{ added?: number }>(`${base}/publish`, { body: { action } });
    if (!r.ok) setNote({ tone: "bad", text: r.error });
    else setNote({ tone: "info", text: action === "auto" ? `빈 좌석에 ${r.data.added ?? 0}자리를 채웠어요. 확인해서 배포해 주세요.` : action === "publish" ? "카풀을 회원에게 배포했어요." : "배포를 취소했어요." });
    load();
  }

  if (!d) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const names = (ids: string[]) => ids.map(nm).filter(Boolean);
  // 이 구간에 다른 차량(저장된 상태 기준)에 이미 있는 사람
  const elsewhere = (carId: string, dir: Dir) =>
    new Set(d.cars.filter((c) => c.id !== carId && c[dir].on).flatMap((c) => [c.driverId, ...c[dir].riders]).filter(Boolean));

  // 구간별 탑승자 고르기
  const riders = (c: Car, dir: Dir) => {
    const leg = c[dir];
    const free = d!.free[dir];
    const busy = elsewhere(c.id, dir);
    const rank = (id: string) => (free.includes(id) ? 0 : busy.has(id) ? 2 : 1);
    const options = d!.members.filter((m) => !leg.riders.includes(m.id) && m.id !== c.driverId).sort((a, b) => rank(a.id) - rank(b.id));
    return (
      <>
        <div className="checks" aria-label={`${LABEL[dir]} 탑승자`}>
          {leg.riders.map((r) => (
            <label key={r}>{nm(r)}{canEdit && <button type="button" className="mini danger" style={{ minHeight: 28, padding: "0 8px" }} onClick={() => setLeg(c.id, dir, { riders: leg.riders.filter((y) => y !== r) })} aria-label={`${LABEL[dir]} ${nm(r)} 빼기`}>×</button>}</label>
          ))}
          {leg.riders.length === 0 && <span className="small">탑승자가 없어요</span>}
        </div>
        {canEdit && (
          <select aria-label={`${LABEL[dir]} 탑승자 추가`} className="field" value="" onChange={(e) => e.target.value && setLeg(c.id, dir, { riders: [...leg.riders, e.target.value] })}>
            <option value="">+ {LABEL[dir]} 탑승자 추가 (차 없는 분 먼저)</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{rank(m.id) === 0 ? " (차 없음)" : rank(m.id) === 2 ? " (다른 차량)" : ""}</option>
            ))}
          </select>
        )}
      </>
    );
  };

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className={`pill ${d.published ? "ok" : "warn"}`}>{d.published ? "회원에게 배포됨" : "배포 전 (회원에게 안 보여요)"}</span>
        <span className="small">갈 때 대기 {d.free.go.length}명 · 올 때 대기 {d.free.back.length}명</span>
      </div>

      {d.cars.length === 0 && <div className="msg info">등록된 차량이 없어요. “+ 차량 등록”으로 차량을 등록해 주세요.</div>}
      <div className="cards">
        {d.cars.map((c) => {
          const x = draft[c.id] ?? c;
          return (
            <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <input aria-label="그룹명" className="field" style={{ width: 150, minHeight: 42 }} value={x.name} placeholder="그룹명" disabled={!canEdit} onChange={(e) => set(c.id, { name: e.target.value })} />
                <span className={`pill ${x.go.on && x.back.on ? "ok" : x.go.on || x.back.on ? "blue" : "bad"}`}>{legPill(x)}</span>
              </div>
              <div className="grid2">
                <div><label className="l" htmlFor={`dr-${c.id}`}>운전자</label>
                  <select id={`dr-${c.id}`} className="field" value={x.driverId} disabled={!canEdit} onChange={(e) => set(c.id, { driverId: e.target.value })}>
                    <option value="">미정</option>{d.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select></div>
                <div><label className="l" htmlFor={`pl-${c.id}`}>차량번호</label><input id={`pl-${c.id}`} className="field" value={x.plate} disabled={!canEdit} onChange={(e) => set(c.id, { plate: e.target.value })} /></div>
                <div><label className="l" htmlFor={`se-${c.id}`}>좌석 수(운전자 빼고)</label><input id={`se-${c.id}`} className="field" type="number" min={1} max={12} value={x.seats} disabled={!canEdit} onChange={(e) => set(c.id, { seats: Number(e.target.value) })} /></div>
              </div>
              <LegToggles idp={`on-${c.id}`} go={x.go.on} back={x.back.on} disabled={!canEdit} onToggle={(dir, on) => setLeg(c.id, dir, toggled(x, dir, on))} />
              {DIRS.filter((dir) => x[dir].on).map((dir) => (
                <section key={dir} aria-label={`${x.name} ${LABEL[dir]}`} style={legBox}>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <b>{LABEL[dir]}</b>
                    <span className={`pill ${x[dir].riders.length > x.seats ? "bad" : "blue"}`}>{x[dir].riders.length} / {x.seats}석</span>
                  </div>
                  <LegFields idp={`${dir}-${c.id}`} leg={x[dir]} disabled={!canEdit} onChange={(p) => setLeg(c.id, dir, p)} />
                  {riders(x, dir)}
                </section>
              ))}
              {!x.go.on && !x.back.on && <div className="msg bad" role="alert">갈 때와 올 때 중 하나는 운행해야 해요.</div>}
              {canEdit && <div className="row" style={{ flexWrap: "wrap" }}><button className="mini" type="button" onClick={() => save(c.id)}>저장</button><button className="mini danger" type="button" onClick={() => remove(c.id)}>차량 지우기</button></div>}
            </div>
          );
        })}
        <section className="card" aria-label="배정 대기" style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--soft)" }}>
          <b>배정 대기</b>
          <span className="small">참석 신청했지만 아직 차가 정해지지 않은 분</span>
          {DIRS.map((dir) => (
            <div key={dir}>
              <span className="small" style={{ fontWeight: 700 }}>{LABEL[dir]} 대기 · {d.free[dir].length}명</span>
              <div>{d.free[dir].length ? names(d.free[dir]).join(" · ") : <span className="small">모두 배정됐어요</span>}</div>
            </div>
          ))}
        </section>
      </div>

      {canEdit && (
        <>
          <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }} onClick={() => { setErr(""); setOpen(true); }}>+ 차량 등록</button>
          <Popup id="carpool-new" width={720} title="차량 등록" open={open} onClose={() => setOpen(false)} dirty={JSON.stringify(nu) !== JSON.stringify(blank())}>
          <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {err && <div className="msg bad" role="alert">{err}</div>}
            <div className="grid2">
              <div><label className="l" htmlFor="nc-nm">그룹명 (비우면 자동)</label><input id="nc-nm" className="field" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></div>
              <div><label className="l" htmlFor="nc-dr">운전자</label><select id="nc-dr" className="field" value={nu.driverId} onChange={(e) => setNu({ ...nu, driverId: e.target.value })}><option value="">미정</option>{d.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div><label className="l" htmlFor="nc-pl">차량번호</label><input id="nc-pl" className="field" value={nu.plate} onChange={(e) => setNu({ ...nu, plate: e.target.value })} /></div>
              <div><label className="l" htmlFor="nc-se">좌석 수(운전자 빼고)</label><input id="nc-se" className="field" type="number" min={1} max={12} value={nu.seats} onChange={(e) => setNu({ ...nu, seats: Number(e.target.value) })} /></div>
            </div>
            <LegToggles idp="nc-on" go={nu.go.on} back={nu.back.on} onToggle={(dir, on) => setNu((n) => ({ ...n, [dir]: { ...n[dir], ...toggled(n, dir, on) } }))} />
            {DIRS.filter((dir) => nu[dir].on).map((dir) => (
              <section key={dir} aria-label={`새 차량 ${LABEL[dir]}`} style={legBox}>
                <b>{LABEL[dir]} 일정</b>
                <LegFields idp={`nc-${dir}`} leg={nu[dir]} onChange={(p) => setNu((n) => ({ ...n, [dir]: { ...n[dir], ...p } }))} />
              </section>
            ))}
            <button className="btn" type="submit" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }}>차량 등록</button>
          </form>
          </Popup>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("auto")}>빈 좌석 자동 배정</button>
            {!d.published
              ? <button className="btn" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("publish")} disabled={d.cars.length === 0}>확인 (회원에게 배포)</button>
              : <button className="btn red" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("unpublish")}>배포 취소</button>}
          </div>
          <span className="small">차량마다 갈 때·올 때 운행 여부를 고르고, 구간별로 일정과 탑승자를 정해요. 둘 다 운행하면 왕복이에요. 같은 사람이 같은 구간의 두 차량에 들어갈 수 없고, 운전자는 운행하는 구간 모두에 포함돼요. 운전자, 차량번호, 장소, 시간은 몰라도 등록할 수 있어요. 그룹명을 비우면 "카풀 1조"처럼 자동으로 붙어요. 바꾼 뒤에는 다시 확인을 눌러야 배포돼요.</span>
        </>
      )}
    </>
  );
}
