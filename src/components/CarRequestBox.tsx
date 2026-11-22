"use client";

import { ActionNote } from "@/components/ActionNote";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapButton } from "./MapButton";
import { api, fmtDateTime } from "@/lib/client";
import { fs } from "@/lib/fs";
import { Fold } from "./EventInfoCard";
import { DateField } from "./DateField";
import { NameSearch } from "./NameSearch";
import { Popup } from "./Popup";

type Dir = "go" | "back";
type Leg = { dir: Dir; label: string; from: string; to: string; departAt: string; arriveAt: string; taken: number; waiting: number; riders: string[]; crewList: string[]; seats: number; memo: string };
type Car = { id: string; name: string; kind: "member" | "rental"; plate: string; driver: string; crew: string; seats: number; memo: string; mine: boolean; legs: Leg[] };
type Phase = "none" | "open" | "closed" | "confirmed" | "admin";
type Mine = { id: string; carId: string; dir: Dir; status: string; label: string; note: string; createdAt: string; handledAt: string; isNew: boolean; waitRank: number };
type LegForm = { on: boolean; from: string; departAt: string; to: string; arriveAt: string; seats: number; memo: string };
type MyCar = { id: string; name: string; plate: string; driverId: string; driverName: string; seats: number; memo: string; missing: string[]; go: LegForm & { riders: number }; back: LegForm & { riders: number } };
type Data = {
  open: boolean; recruiting: boolean; recruitUntil: string; recruitFrom: string; openFrom: string; waitUntil: string; waitClosed: boolean; attending: boolean;
  cars: Car[]; mine: Mine[]; myCar: MyCar | null; members: { id: string; name: string }[];
  phase: Phase; published: boolean; myRide: Record<Dir, string>; hasCarpool: boolean;
  mySelf: Record<Dir, boolean>; // 개별 이동을 골랐는지(구간별)
  adminOnly: boolean; recruitOn: boolean; // 관리자배정 / 차량모집을 켰는지
  myName?: string; // 탑승자 명단에서 내 이름 강조
  myRole?: Record<Dir, "rider" | "driver" | "self" | "">; // 구간별 내 역할
};
type Who = "me" | "member" | "other"; // 운전자: 나 / 다른 회원 / 회원 아닌 사람
type Offer = { who: Who; driverId: string; driverName: string; name: string; plate: string; go: LegForm; back: LegForm };

const TONE: Record<string, string> = { pending: "blue", waiting: "gray", approved: "blue", confirmed: "ok", rejected: "bad", canceled: "gray" };
const LABEL: Record<Dir, string> = { go: "갈 때", back: "올 때" };
const emptyLeg = (): LegForm => ({ on: true, from: "", departAt: "", to: "", arriveAt: "", seats: 5, memo: "" });
// 회원이 보는 상태 이름: 승인 단계가 없으므로 approved = "배정(확정 전)"
const shown = (m: Mine) => (m.status === "approved" ? "배정됨 · 확정 전" : m.label);

// 일정 화면 › 차량: 차량모집(내 차로 지원하기) + 차량신청.
// 차량신청은 승인 없이 자리가 있으면 바로 배정(확정 전), 정원이 차면 대기 → 자리가 나면 자동 배정. 관리자가 확정하면 종 알림.
export function CarRequestBox({ eventId }: { eventId: string }) {
  const base = `/api/events/${eventId}/cars`;
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickOther, setPickOther] = useState(false); // 확정 뒤 다른 차량 목록 펼치기
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [offerErr, setOfferErr] = useState("");
  const autoOpened = useRef(false);

  const load = useCallback(async () => {
    const r = await api<Data>(base);
    if (!r.ok) return;
    setD(r.data);
    // 새 결과(확정 등)를 봤으면 종 숫자에서 뺀다
    if (r.data.mine.some((m) => m.isNew)) api(base, { body: { action: "seen" } });
    // 알림("차량 정보를 입력해 주세요")으로 들어오면 차량 정보 입력 창을 바로 연다(한 번)
    if (r.data.myCar && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("carEdit") === "1" && !autoOpened.current) {
      autoOpened.current = true;
      setTimeout(() => document.getElementById("car-offer-open")?.click(), 0);
    }
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  if (!d || !d.hasCarpool) return null;

  const latest = (dir: Dir) => d.mine.filter((m) => m.dir === dir);
  const seated = (dir: Dir) => latest(dir).find((m) => m.status === "confirmed" || m.status === "approved");
  const openReq = (dir: Dir) => latest(dir).find((m) => m.status === "pending" || m.status === "waiting");

  async function request(car: Car, leg: Leg) {
    const full = leg.taken >= leg.seats;
    const change = seated(leg.dir);
    const waitingNow = openReq(leg.dir);
    const q = full
      ? `${car.name} ${leg.label}은(는) 정원이 찼어요. 신청 대기할까요?${waitingNow ? "\n지금 신청 대기 중인 차는 취소돼요." : ""}\n자리가 나면 차례대로 자동 배정돼요.`
      : change ? `${leg.label} 차량을 ${car.name}(으)로 바꿀까요?\n바로 옮겨지고 지금 차에서는 빠져요.`
      : waitingNow ? `신청 대기하지 않고 ${car.name} ${leg.label}(으)로 바꿀까요?\n지금 신청 대기는 취소되고 이 차에 바로 배정돼요.`
      : `${car.name} ${leg.label}에 신청할까요?\n자리가 있어서 바로 배정돼요.`;
    if (!window.confirm(q)) return;
    setBusy(true);
    const r = await api<{ status: string }>(base, { body: { action: "request", carId: car.id, dir: leg.dir } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: r.data.status === "waiting" ? "신청 대기했어요. 자리가 나면 자동으로 배정되고 알려 드려요." : "배정됐어요. 관리자가 확정하면 알림이 가요." } : { tone: "bad", text: r.error });
    load();
  }
  async function cancel(m: Mine) {
    if (!window.confirm(m.status === "waiting" ? "신청 대기를 취소할까요?" : "이 배정을 취소할까요? 자리는 대기하던 분에게 넘어가요.")) return;
    setBusy(true);
    const r = await api(base, { body: { action: "cancel", reqId: m.id } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "취소했어요." } : { tone: "bad", text: r.error });
    load();
  }

  // 내 차로 지원하기 / 지원 수정
  function startOffer() {
    const c = d!.myCar;
    setOfferErr("");
    setOffer(c ? {
      who: c.driverId ? "member" : "other", driverId: c.driverId, driverName: c.driverName, name: c.name, plate: c.plate,
      go: { on: c.go.on, from: c.go.from, departAt: c.go.departAt, to: c.go.to, arriveAt: c.go.arriveAt, seats: c.go.seats, memo: c.go.memo },
      back: { on: c.back.on, from: c.back.from, departAt: c.back.departAt, to: c.back.to, arriveAt: c.back.arriveAt, seats: c.back.seats, memo: c.back.memo },
    } : { who: "me", driverId: "", driverName: "", name: "", plate: "", go: emptyLeg(), back: emptyLeg() });
  }
  async function saveOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!offer) return;
    if (!offer.go.on && !offer.back.on) return setOfferErr("갈 때와 올 때 중 하나는 운행해야 해요.");
    if (offer.who === "member" && !offer.driverId) return setOfferErr("운전할 회원을 골라 주세요.");
    if (offer.who === "other" && !offer.driverName.trim()) return setOfferErr("운전자 이름을 적어 주세요.");
    setOfferErr("");
    setBusy(true);
    const car = {
      name: offer.name, plate: offer.plate,
      driverId: offer.who === "me" ? "__me__" : offer.who === "member" ? offer.driverId : "", driverName: offer.who === "other" ? offer.driverName : "",
      go: offer.go, back: offer.back,
    };
    const r = await api(base, { body: { action: d!.myCar ? "offerUpdate" : "offer", car } });
    setBusy(false);
    if (!r.ok) return setOfferErr(r.error);
    setOffer(null);
    setMsg({ tone: "info", text: d!.myCar ? "지원한 차량 정보를 고쳤어요." : "차량을 지원했어요. 고맙습니다! 차량신청이 열리면 회원들이 신청해요." });
    load();
  }
  async function cancelOffer() {
    if (!window.confirm("차량모집 지원을 취소할까요? 이 차에 배정된 분들은 다시 신청해야 해요.")) return;
    setBusy(true);
    const r = await api(base, { body: { action: "offerCancel" } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "차량모집 지원을 취소했어요." } : { tone: "bad", text: r.error });
    load();
  }
  // 마감 뒤: 관리자에게 변경·취소 요청(종 알림)
  async function ask() {
    const note = window.prompt("관리자에게 보낼 변경·취소 요청을 적어 주세요.\n예: 올 때 다른 차로 바꾸고 싶어요 / 갈 때 차량 취소할게요");
    if (!note || !note.trim()) return;
    setBusy(true);
    const r = await api(base, { body: { action: "ask", note: note.trim() } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "관리자에게 요청을 보냈어요. 관리자가 바꾸면 알림이 가요." } : { tone: "bad", text: r.error });
  }
  // 개별 이동 고르기·취소(구간별)
  async function toggleSelf(dir: Dir) {
    const on = !d!.mySelf?.[dir];
    const q = on ? `${LABEL[dir]} 차 없이 개별 이동할까요?${seated(dir) || openReq(dir) ? "\n지금 신청한 차는 취소돼요." : ""}` : `${LABEL[dir]} 개별 이동을 취소할까요? 차량을 다시 신청할 수 있어요.`;
    if (!window.confirm(q)) return;
    setBusy(true);
    const r = await api(base, { body: { action: "self", dir, on } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: on ? `${LABEL[dir]} 개별 이동으로 정했어요.` : `${LABEL[dir]} 개별 이동을 취소했어요.` } : { tone: "bad", text: r.error });
    load();
  }
  const setLeg = (dir: Dir, p: Partial<LegForm>) => setOffer((o) => (o ? { ...o, [dir]: { ...o[dir], ...p } } : o));

  const ride = (dir: Dir) => d.myRide?.[dir] ? `“${d.myRide[dir]}”` : "없음";
  const rideLine = `갈 때 ${ride("go")}, 올 때 ${ride("back")}`;
  // 차량 목록(신청 화면). canAsk 가 false 면 버튼 없이 정보만
  const carList = (canAskAll: boolean, only?: (c: Car) => boolean) => d.cars.filter((c) => !only || only(c)).length > 0 && (
    <ul className="car-list">
      {d.cars.filter((c) => !only || only(c)).map((car) => (
        <li key={car.id} className="car-item">
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <b className="grow">{car.name}{car.mine && <span className="small"> (내가 지원한 차)</span>}</b>
            {(d.myRide?.go === car.name || d.myRide?.back === car.name) && <span className="pill warn">내가 타는 차</span>}
            <span className="chip line">{car.kind === "rental" ? "외부 대절" : "회원 차량"}</span>
          </div>
          <span className="small" style={d.myName && car.crew.includes(d.myName) ? { color: "var(--accent-ink)", fontWeight: 700 } : undefined}>{[car.crew, car.plate].filter(Boolean).join(" · ")}{d.myName && car.crew.includes(d.myName) ? " (나)" : ""}</span>
          {car.legs.map((leg) => {
            const full = leg.taken >= leg.seats;
            const mineHere = d.mine.find((m) => m.carId === car.id && m.dir === leg.dir && ["pending", "waiting", "approved", "confirmed"].includes(m.status));
            const canAsk = canAskAll && d.open && d.attending && !car.mine && !mineHere && (!full || !d.waitClosed);
            return (
              <div key={leg.dir} className="car-leg">
                {/* 한 줄: 갈 때 · 출발지 → 도착지 ……… [신청 3/4] (신청할 수 없으면 3/4 표시만) */}
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <b style={{ fontSize: fs(14) }}>{leg.label}</b>
                  <span className="small grow">{leg.from || leg.to ? <>{leg.from || "?"}{leg.from && <MapButton place={leg.from} label={`출발지 ${leg.from} 지도 보기`} style={{ minHeight: 26, padding: "0 6px", marginLeft: 4 }}>지도</MapButton>} → {leg.to || "?"}{leg.to && <MapButton place={leg.to} label={`도착지 ${leg.to} 지도 보기`} style={{ minHeight: 26, padding: "0 6px", marginLeft: 4 }}>지도</MapButton>}</> : ""}</span>
                  {canAsk ? (
                    <button type="button" className={`btn car-ask${full ? " white" : ""}`} disabled={busy} onClick={() => request(car, leg)}
                      aria-label={`${car.name} ${leg.label} ${full ? "신청 대기" : "신청"} (${leg.taken}/${leg.seats}석)`}>
                      <span>{full ? (openReq(leg.dir) ? "이 차로 신청 대기" : "신청 대기") : seated(leg.dir) || openReq(leg.dir) ? "이 차로 바꾸기" : "신청"}</span>
                      <span className="car-ask-n">{leg.taken}/{leg.seats}</span>
                    </button>
                  ) : (
                    <span className={`pill ${full ? "bad" : "blue"}`}>{leg.taken}/{leg.seats}{full ? " 마감" : ""}</span>
                  )}
                </div>
                {leg.waiting > 0 && <span className="small">신청 대기 {leg.waiting}명</span>}
                {leg.departAt && <span className="small">{fmtDateTime(leg.departAt)} 출발</span>}
                {leg.memo && <span className="small">메모 · {leg.memo}</span>}
                {/* 탑승자: 운전자 줄 밑에 따로 한 줄, 오른쪽 정렬. 내 이름은 진하게 강조 */}
                {(d.published || leg.riders.length > 0) && (
                  <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="small" style={{ flex: "0 0 auto" }}>탑승자 {leg.riders.length}명</span>
                    <span style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }} aria-label={`${leg.label} 탑승자`}>
                      {leg.riders.length === 0 && <span className="small">탑승자 없음</span>}
                      {leg.riders.map((n, i) => {
                        const me = !!d.myName && n === d.myName;
                        return (
                          <span key={i} className={`chip ${me ? "violet" : "line"}`} style={me ? { fontWeight: 800, outline: "2px solid var(--accent-ink)" } : undefined}>
                            {n}{me ? " (나)" : ""}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                )}
                {mineHere && <span className="small" style={{ fontWeight: 700 }}>내 상태: {shown(mineHere)}</span>}
              </div>
            );
          })}
        </li>
      ))}
    </ul>
  );
  // 내 신청(최근 것) — 신청 중일 때 취소용
  const myReqs = d.mine.filter((m) => m.status !== "canceled" || m.note).slice(0, 4).map((m) => {
    const car = d.cars.find((c) => c.id === m.carId);
    return (
      <div key={m.id} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className={`pill ${TONE[m.status] ?? "gray"}`}>{shown(m)}{m.status === "waiting" && m.waitRank ? ` ${m.waitRank}번` : ""}</span>
        <span className="grow small">{LABEL[m.dir]} · {car?.name ?? "차량"}{m.note ? ` · ${m.note}` : ""}</span>
        {m.isNew && <span className="chip red">NEW</span>}
        {(m.status === "waiting" || m.status === "approved" || m.status === "confirmed") && !d.waitClosed && <button type="button" className="mini" disabled={busy} onClick={() => cancel(m)}>취소</button>}
      </div>
    );
  });
  // 탑승 취소(배정된 차에서 내리기)
  async function leave(dir: Dir) {
    if (!window.confirm(`${LABEL[dir]} ${d?.myRide?.[dir] ?? ""} 탑승을 취소할까요? 자리가 비고, 관리자에게 알림이 가요.`)) return;
    setBusy(true);
    setMsg(null);
    const r = await api(base, { body: { action: "leave", dir } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: `${LABEL[dir]} 탑승을 취소했어요. 개별 이동하거나 다른 차량을 신청할 수 있어요.` } : { tone: "bad", text: r.error });
    await load();
  }
  // 확정·마감 뒤 "내 탑승": 구간마다 지금 상태와 바꿀 수 있는 것
  const myRideBlock = d.attending && (d.phase === "confirmed" || d.phase === "closed") && (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--soft)" }}>
      <b style={{ fontSize: fs(15) }}>내 탑승</b>
      {(["go", "back"] as Dir[]).map((dir) => {
        const role = d.myRole?.[dir] ?? "";
        const car = d.myRide?.[dir] ?? "";
        return (
          <div key={dir} className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <b style={{ fontSize: fs(14), flex: "0 0 auto" }}>{LABEL[dir]}</b>
            <span className="grow small" style={{ fontWeight: 700 }}>
              {role === "self" ? "개별 이동" : role === "driver" ? `${car} (운전·지원)` : car || "배정된 차량 없음"}
            </span>
            {role === "rider" && <button type="button" className="mini" disabled={busy} onClick={() => leave(dir)}>탑승 취소</button>}
            {role !== "self" && role !== "driver" && <button type="button" className="mini" disabled={busy} onClick={() => toggleSelf(dir)}>개별 이동으로</button>}
            {role === "self" && !d.waitClosed && <button type="button" className="mini" disabled={busy} onClick={() => toggleSelf(dir)}>개별 이동 취소</button>}
          </div>
        );
      })}
      {/* 다른 차량 신청: 마감 전이면 직접(목록에서 “신청”·“이 차로 바꾸기”), 마감 뒤에는 관리자에게 요청 */}
      {!d.waitClosed && !d.adminOnly ? (
        <>
          <button type="button" className="mini" style={{ alignSelf: "flex-start" }} onClick={() => setPickOther(!pickOther)}>{pickOther ? "차량 목록 접기" : "다른 차량 신청하기"}</button>
          {pickOther && carList(true)}
        </>
      ) : (
        <span className="small">다른 차량이 필요하면 아래 “관리자에게 변경·취소 요청”을 눌러 주세요. 탑승 취소와 개별 이동은 지금도 직접 할 수 있어요.</span>
      )}
    </div>
  );
  // 마감 뒤 변경 안내
  const askBlock = d.attending && (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <span className="small grow">변경을 원하시면 “관리자에게 변경·취소 요청”을 눌러 주세요. 관리자가 바꾸면 알려 드려요.</span>
      <button type="button" className="btn white" disabled={busy} style={{ width: "auto", minHeight: 40, fontSize: fs(14) }} onClick={ask}>관리자에게 변경·취소 요청</button>
    </div>
  );

  return (
    <div id="cars" style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 16 }}>
      <ActionNote msg={msg} />

      {/* 1) 차량신청: 처음에는 접어 두고(일정 화면이 복잡하지 않게), 접힌 줄에 단계별 요약을 보여 준다 */}
      <Fold key={d.phase} title="차량배정" badge={d.phase === "open" && d.open ? <span className="pill ok">신청 중</span> : d.phase === "confirmed" ? <span className="pill ok">확정</span> : undefined}
        summary={d.phase === "confirmed" || d.phase === "closed" ? rideLine : d.phase === "open" ? (d.waitUntil ? `차량신청 마감 ${fmtDateTime(d.waitUntil)}` : "차량신청을 받고 있어요") : d.phase === "admin" ? "관리자가 차량을 배정 중이에요" : "차량배정 정보가 아직 없어요"}>
        {d.phase === "admin" && <span className="small" style={{ fontWeight: 700 }}>관리자가 차량을 배정 중입니다. 배정이 완료되면 안내드리겠습니다.</span>}
        {d.phase === "none" && <span className="small">차량배정 정보가 없습니다. 업데이트 되면 알려드릴께요.</span>}
        {d.phase === "open" && (
          <>
            {d.openFrom && Date.parse(d.openFrom) > Date.now() && <span className="small">차량신청 시작: {fmtDateTime(d.openFrom)}</span>}
            {d.waitUntil && <span className="small" style={{ fontWeight: 700 }}>차량신청 마감: {fmtDateTime(d.waitUntil)}</span>}
            <span className="small">지금까지 등록된 차량으로 신청을 받습니다. 신청할 수 있는 차량이 더 등록되면 목록에 바로 더해지고 알려 드려요.</span>
            {!d.attending && <div className="msg info">참석 신청하면 차량을 신청할 수 있어요.</div>}
            {/* 개별 이동: 차 없이 각자 이동(다시 누르면 취소) */}
            {d.attending && (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="small grow">차 없이 각자 가시나요?</span>
                {(["go", "back"] as Dir[]).map((dir) => (
                  <button key={dir} type="button" className={`mini${d.mySelf?.[dir] ? " on-self" : ""}`} aria-pressed={!!d.mySelf?.[dir]} disabled={busy} onClick={() => toggleSelf(dir)}>
                    {d.mySelf?.[dir] ? `✓ ${LABEL[dir]} 개별 이동 (취소)` : `${LABEL[dir]} 개별 이동`}
                  </button>
                ))}
              </div>
            )}
            {myReqs}
            {carList(true)}
          </>
        )}
        {d.phase === "closed" && (
          <>
            <span className="small" style={{ fontWeight: 700 }}>차량신청이 마감되었습니다. 회원님의 신청 차량은 {rideLine} 입니다.</span>
            {myRideBlock}
            {carList(false)}
            {askBlock}
          </>
        )}
        {d.phase === "confirmed" && (
          <>
            <span className="small" style={{ fontWeight: 700 }}>차량배정이 확정되었습니다. 회원님이 탑승할 차량은 {rideLine} 입니다.</span>
            {myRideBlock}
            {/* 내 차 먼저(출발·도착·확정 명단), 다른 차는 접어서 */}
            {carList(false, (c) => c.name === d.myRide?.go || c.name === d.myRide?.back)}
            {d.cars.some((c) => c.name !== d.myRide?.go && c.name !== d.myRide?.back) && (
              <details className="car-others">
                <summary>다른 차량 보기</summary>
                {carList(!d.waitClosed && !d.adminOnly, (c) => c.name !== d.myRide?.go && c.name !== d.myRide?.back)}
              </details>
            )}
            {d.waitClosed || d.adminOnly ? askBlock : d.attending && <span className="small">변경을 원하시면 위 다른 차량의 “이 차로 바꾸기”를 누르거나 내 신청을 취소할 수 있어요. 바꾸면 관리자가 다시 확정한 뒤 알려 드려요.</span>}
            {!d.waitClosed && myReqs}
          </>
        )}
      </Fold>

      {/* 2) 차량모집 지원: 모집 중이거나 내가 지원한 차가 있을 때 */}
      {d.recruitOn && (d.recruiting || d.myCar) && (
        <Fold title="차량모집 지원" badge={d.myCar && d.myCar.missing.length > 0 ? <span className="pill warn">정보 입력 필요</span> : d.recruiting ? <span className="pill blue">모집 중</span> : undefined}
          summary={d.myCar ? "내가 지원한 차량이 있어요" : d.recruitUntil ? `차량모집 마감 ${fmtDateTime(d.recruitUntil)}` : "차를 함께 탈 수 있게 지원해 주세요"}>
          {!d.attending ? <div className="msg info">참석 신청하면 차량을 지원할 수 있어요.</div> : d.myCar ? (
            <div className="car-offer">
              <b>내가 지원한 차량 · {d.myCar.name}</b>
              {/* 빈 칸이 있으면 포인트 색으로 안내 → 정보 수정 */}
              {d.myCar.missing.length > 0 && (
                <span className="car-missing" role="status">
                  차량모집에 지원해 주셔서 감사합니다. 아래 “정보 수정”을 눌러 {d.myCar.missing.join(", ")}을(를) 입력해 주세요.
                </span>
              )}
              <span className="small">갈 때 {d.myCar.go.on ? `${d.myCar.go.riders}명 탑승 / ${d.myCar.go.seats}석${d.myCar.go.memo ? ` · ${d.myCar.go.memo}` : ""}` : "운행 안 함"}</span>
              <span className="small">올 때 {d.myCar.back.on ? `${d.myCar.back.riders}명 탑승 / ${d.myCar.back.seats}석${d.myCar.back.memo ? ` · ${d.myCar.back.memo}` : ""}` : "운행 안 함"}</span>
              {!d.waitClosed && (
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" id="car-offer-open" className={d.myCar.missing.length ? "btn" : "mini"} disabled={busy} onClick={startOffer}
                    style={d.myCar.missing.length ? { width: "auto", minHeight: 40, fontSize: fs(14) } : undefined}>정보 수정</button>
                  <button type="button" className="mini danger" disabled={busy} onClick={cancelOffer}>지원 취소</button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="btn" disabled={busy} style={{ width: "auto", alignSelf: "flex-start", minHeight: 42, fontSize: fs(14) }} onClick={startOffer}>차량모집 지원</button>
          )}
        </Fold>
      )}


      <Popup id="car-offer" width={640} title={d.myCar ? "지원한 차량 수정" : "차량모집 지원"} open={!!offer} onClose={() => setOffer(null)}>
        {offer && (
          <form onSubmit={saveOffer} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {offerErr && <div className="msg bad" role="alert">{offerErr}</div>}
            <div><label className="l" htmlFor="of-nm">그룹명 (선택)</label><input id="of-nm" className="field" maxLength={30} placeholder="비우면 차량번호 → 운전자 이름" value={offer.name} onChange={(e) => setOffer({ ...offer, name: e.target.value })} /></div>
            <span className="l">운전자</span>
            <div className="seg" role="group" aria-label="운전자" style={{ alignSelf: "flex-start" }}>
              <button type="button" aria-pressed={offer.who === "me"} onClick={() => setOffer({ ...offer, who: "me" })} style={{ minHeight: 38, padding: "0 12px" }}>내가 운전</button>
              <button type="button" aria-pressed={offer.who === "member"} onClick={() => setOffer({ ...offer, who: "member" })} style={{ minHeight: 38, padding: "0 12px" }}>다른 회원</button>
              <button type="button" aria-pressed={offer.who === "other"} onClick={() => setOffer({ ...offer, who: "other" })} style={{ minHeight: 38, padding: "0 12px" }}>회원 아닌 분</button>
            </div>
            {offer.who === "member" && <NameSearch id="of-dr" members={d.members} value={offer.driverId} onChange={(v) => setOffer({ ...offer, driverId: v })} />}
            {offer.who === "other" && <input className="field" aria-label="운전자 이름" maxLength={30} placeholder="운전자 이름 (예: 가족·지인)" value={offer.driverName} onChange={(e) => setOffer({ ...offer, driverName: e.target.value })} />}
            <div className="grid2">
              <div><label className="l" htmlFor="of-pl">차량번호 (선택)</label><input id="of-pl" className="field" maxLength={20} value={offer.plate} onChange={(e) => setOffer({ ...offer, plate: e.target.value })} /></div>
            </div>
            <div className="checks" role="group" aria-label="운행 구간">
              {(["go", "back"] as Dir[]).map((dir) => (
                <label key={dir}><input type="checkbox" checked={offer[dir].on} onChange={(e) => setLeg(dir, { on: e.target.checked })} />{LABEL[dir]}</label>
              ))}
            </div>
            {(["go", "back"] as Dir[]).filter((dir) => offer[dir].on).map((dir) => (
              <div key={dir} className="grid2" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <div><label className="l" htmlFor={`of-${dir}-fr`}>{LABEL[dir]} 출발지</label><input id={`of-${dir}-fr`} className="field" value={offer[dir].from} onChange={(e) => setLeg(dir, { from: e.target.value })} /></div>
                <div><label className="l" htmlFor={`of-${dir}-dp`}>{LABEL[dir]} 출발 시간</label><DateField id={`of-${dir}-dp`} mode="datetime" value={offer[dir].departAt} onChange={(v) => setLeg(dir, { departAt: v })} /></div>
                <div><label className="l" htmlFor={`of-${dir}-to`}>{LABEL[dir]} 도착지</label><input id={`of-${dir}-to`} className="field" value={offer[dir].to} onChange={(e) => setLeg(dir, { to: e.target.value })} /></div>
                <div><label className="l" htmlFor={`of-${dir}-se`}>{LABEL[dir]} {offer.who === "other" ? "좌석 수(운전자 제외)" : "탈 수 있는 인원 (운전자 포함)"}</label><input id={`of-${dir}-se`} className="field" type="number" min={1} max={12} value={offer[dir].seats || ""} onChange={(e) => setLeg(dir, { seats: Number(e.target.value) })} /></div>
                <div style={{ gridColumn: "1 / -1" }}><label className="l" htmlFor={`of-${dir}-mm`}>{LABEL[dir]} 메모</label><input id={`of-${dir}-mm`} className="field" maxLength={100} placeholder="예: 강남역 경유 가능" value={offer[dir].memo} onChange={(e) => setLeg(dir, { memo: e.target.value })} /></div>
              </div>
            ))}
            <button className="btn" type="submit" disabled={busy} style={{ width: "auto", alignSelf: "flex-start", minHeight: 46 }}>{d.myCar ? "저장" : "지원하기"}</button>
          </form>
        )}
      </Popup>
    </div>
  );
}
