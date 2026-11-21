"use client";

import Link from "next/link";
import { RowDelete } from "./RowDelete";
import { useCallback, useEffect, useState, useRef } from "react";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { families, sourceLabel, type TplRow } from "@/lib/template-families";
import { activityActions, canSelect, type TemplateConfig } from "@/lib/template-schema";
import { CapsuleAdmin } from "./CapsuleAdmin";
import { DateField } from "./DateField";
import { AiAssist } from "./AiAssist";
import { AiGuidesEditor, aiPointKeys } from "./AiGuidesEditor";
import { Popup } from "./Popup";
import { SaveChoices, savedText, type SaveMode } from "./SaveChoices";
import { TeamBoard } from "./TeamBoard";
import { modeOf, screenLabel, TemplateEditor, WindowFields, type EditableConfig } from "./TemplateEditor";
import { fs } from "@/lib/fs";

type Act = {
  id: string;
  templateId: string;
  templateVersion: number;
  config: TemplateConfig;
  pre: { enabled: boolean; status: string; opensAt: string; closesAt: string };
  live: { active: boolean; stepKey: string; stepLabel: string; unlocked: boolean; memberScreen: string };
  startsAt: string;
  endsAt: string;
  rosterCount: number;
  attendanceConfirmed: boolean;
  hosts: { memberId: string; code: string }[]; // 진행자(사회자) 여러 명, 사람마다 접속번호
};
type Tpl = TplRow;
type Att = {
  confirmed: boolean; confirmedAt: string; by: string; selectedCount: number;
  // level: 전체참여(full) / 선택참여(partial), bookBlocked: 북공개라 전체참여로 넣을 수 없음(소개 작성 활동)
  members: { id: string; name: string; answer: string; days: string; selected: boolean; published?: boolean; level?: "full" | "partial"; bookBlocked?: boolean }[];
};

const PRE_TEXT: Record<string, string> = {
  none: "현장에서만 진행 (사전 작성 없음)",
  unknown: "사전 작성 있음 · 일정 날짜가 정해지면 기간이 계산돼요",
  before: "사전 작성 시작 전",
  open: "사전 작성 중",
  closed: "사전 작성 마감",
};

// 진행자 지정: 회원 중 한 명 + 진행자 접속번호. 진행자는 이 번호로 로그인하면 활동 진행 화면만 보고,
// 평소 초대코드로 로그인하면 일반 회원으로 활동에 참여한다.
// 템플릿이 진행자를 요구하면(host.required) 펼쳐 두고, 정할 때까지 “진행자 필요”를 보여 준다.
// 진행자 사람·번호는 일정마다 달라서 템플릿이 아니라 여기(일정 활동)에 저장한다.
function HostSetting({ eventId, a, canEdit, members, onChange }: {
  eventId: string; a: Act; canEdit: boolean; members: { id: string; name: string }[]; onChange: () => void;
}) {
  // 진행자 여러 명: 줄마다 [회원 고르기] [접속번호] [자동 생성] [빼기]
  const [rows, setRows] = useState(a.hosts.map((h) => ({ ...h })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(a.hosts);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const newCode = () => String(Math.floor(100000 + Math.random() * 900000));
  const upd = (i: number, patch: Partial<{ memberId: string; code: string }>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const incomplete = rows.some((r) => !r.memberId || r.code.length < 4);

  async function save(next = rows) {
    setBusy(true);
    setMsg(null);
    const r = await api<{ hosts: { memberId: string; code: string }[] }>(`/api/admin/events/${eventId}/activities/${a.id}/host`, { method: "PUT", body: { hosts: next } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setRows(r.data.hosts);
    setMsg({ tone: "info", text: next.length ? `진행자 ${next.length}명을 저장했어요. 각자에게 접속번호를 알려 주세요.` : "진행자 지정을 모두 풀었어요." });
    onChange();
  }

  const required = !!a.config.host?.required;
  const has = a.hosts.length > 0;
  return (
    <details open={required || has || undefined} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ font: `700 ${fs(16)} var(--display)` }}>진행자</b>
        {required && !has && <span className="pill warn">진행자 필요</span>}
        {has && <span className="pill ok">{a.hosts.map((h) => nameOf(h.memberId) || "지정됨").join(", ")}</span>}
        {!required && !has && <span className="pill gray">선택</span>}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {required && !has && <div className="msg info" role="status">이 활동은 진행자가 있어야 해요(템플릿 설정). 진행자를 정해야 현장 진행을 시작할 수 있어요. 관리자가 직접 진행하는 것은 돼요.</div>}
      {a.config.host?.note && <span className="small"><b>진행자 안내:</b> {a.config.host.note}</span>}
      <span className="small" style={{ fontSize: fs(12) }}>
        진행자는 여러 명 둘 수 있고, 사람마다 <b>진행자 접속번호</b>를 따로 정해요. 진행자가 로그인 화면에서 자기 이름을 고르고 자기 접속번호를 넣으면 이 활동의 진행 화면만 보여요.
        평소 초대코드(연락처 뒷자리)로 들어오면 일반 회원으로 활동에 참여해요.
      </span>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" type="button" disabled={busy || rows.length >= 20} style={{ width: "auto", minHeight: 34, padding: "0 10px", fontSize: fs(12) }}
            onClick={() => setRows([...rows, { memberId: "", code: newCode() }])}>+ 진행자 추가</button>
        </div>
      )}
      {rows.length === 0 && <span className="small">아직 진행자가 없어요.{canEdit ? " “+ 진행자 추가”로 넣어 주세요." : ""}</span>}
      {rows.length > 0 && (
        <div className="tblw">
          <table className="tbl compact stack" style={{ minWidth: 460 }}>
            <thead><tr><th>진행자 (회원)</th><th>접속번호 (숫자 4~8자리)</th><th><span className="sr-only">버튼</span></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td data-label="진행자">
                    <select className="field" aria-label={`${i + 1}번째 진행자`} value={r.memberId} disabled={!canEdit || busy} onChange={(e) => upd(i, { memberId: e.target.value })}>
                      <option value="">회원 고르기</option>
                      {members.filter((m) => m.id === r.memberId || !rows.some((x) => x.memberId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td data-label="접속번호">
                    <input className="field num" inputMode="numeric" maxLength={8} aria-label={`${i + 1}번째 진행자 접속번호`} value={r.code} disabled={!canEdit || busy}
                      onChange={(e) => upd(i, { code: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
                  </td>
                  <td className="act" data-label="" style={{ whiteSpace: "nowrap" }}>
                    {canEdit && (
                      <>
                        <button className="mini" type="button" disabled={busy} style={{ minHeight: 32, fontSize: fs(12) }} onClick={() => upd(i, { code: newCode() })}>자동 생성</button>{" "}
                        <RowDelete label={`${i + 1}번째 진행자 빼기`} disabled={busy} onClick={() => setRows(rows.filter((_, j) => j !== i))} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (dirty || rows.length > 0) && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn" type="button" disabled={busy || !dirty || incomplete} style={{ width: "auto", minWidth: 120, minHeight: 40, fontSize: fs(14) }} onClick={() => save()}>
            {busy ? "저장 중…" : "진행자 저장"}
          </button>
          {incomplete && <span className="small" style={{ color: "var(--red-t)", fontSize: fs(12) }}>진행자를 고르고 접속번호를 4자리 이상 넣어 주세요.</span>}
          {!dirty && has && <span className="small" style={{ fontSize: fs(12) }}>저장됨 · {a.hosts.map((h) => `${nameOf(h.memberId)} ${h.code}`).join(" · ")}</span>}
        </div>
      )}
      </div>
    </details>
  );
}

// 활동의 날짜와 진행 시간. 회원에게 알려 주는 안내용 정보이고, 참여 대상과는 연결하지 않는다.
function Schedule({ eventId, a, canEdit, onChange }: { eventId: string; a: Act; canEdit: boolean; onChange: () => void }) {
  const [s, setS] = useState(a.startsAt);
  const [e, setE] = useState(a.endsAt);
  const [saved, setSaved] = useState({ s: a.startsAt, e: a.endsAt }); // 서버에 저장된 값
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);
  // 다시 불러온 값으로 맞춘다(다른 곳에서 바뀐 경우)
  useEffect(() => {
    setSaved({ s: a.startsAt, e: a.endsAt });
    setS(a.startsAt);
    setE(a.endsAt);
  }, [a.startsAt, a.endsAt]);
  const dirty = s !== saved.s || e !== saved.e;

  async function save() {
    if (s && e && e < s) return setMsg({ tone: "bad", text: "끝나는 일시가 시작 일시보다 빨라요." });
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}/schedule`, { method: "PUT", body: { startsAt: s, endsAt: e } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setSaved({ s, e });
    setMsg({ tone: "ok", text: "저장했어요 ✓" });
    onChange();
  }

  // 한 줄: [활동 일시] 시작 ~ 끝 [저장]. 좁은 화면에서는 여러 줄로 내려간다.
  //  저장 버튼: 바꾼 내용이 있으면 눌러야 하는 색(“저장”), 없으면 흐린 “저장됨”으로 상태를 보여 준다.
  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ font: `700 ${fs(15)} var(--display)`, flex: "0 0 auto" }}>활동 일시</b>
        <div style={{ flex: "1 1 190px", minWidth: 0 }}><DateField id={`as-${a.id}`} ariaLabel="활동 시작 일시" mode="datetime" value={s} disabled={!canEdit || busy} onChange={(v) => { setS(v); setMsg(null); }} /></div>
        <span aria-hidden="true" style={{ flex: "0 0 auto" }}>-</span>
        <div style={{ flex: "1 1 190px", minWidth: 0 }}><DateField id={`ae-${a.id}`} ariaLabel="활동 끝나는 일시" mode="datetime" value={e} disabled={!canEdit || busy} onChange={(v) => { setE(v); setMsg(null); }} /></div>
        {canEdit && (
          <button className={`btn ${dirty ? "" : "white"}`} type="button" disabled={busy || !dirty} onClick={save}
            style={{ width: "auto", minWidth: 92, minHeight: 44, fontSize: fs(14), flex: "0 0 auto" }}>
            {busy ? "저장 중…" : dirty ? "저장" : "저장됨"}
          </button>
        )}
      </div>
      {msg ? <span className={msg.tone === "bad" ? "msg bad" : "small"} role={msg.tone === "bad" ? "alert" : "status"} style={msg.tone === "ok" ? { color: "var(--accent-ink)", fontWeight: 700 } : undefined}>{msg.text}</span>
        : dirty && canEdit ? <span className="small" role="status">바꾼 일시를 저장하려면 “저장”을 눌러 주세요.</span>
        : <span className="small">회원에게 보여 주는 안내용 정보예요. 참여자는 “활동참여자선택”에서 따로 정해요.</span>}
    </div>
  );
}

// 사전 작성·사전 맞히기 기간(일정마다 정한다. 템플릿은 있는지 여부만 정한다). 저장 버튼이 상태를 보여 준다.
function PreWindows({ eventId, a, canEdit, evStart, onChange }: { eventId: string; a: Act; canEdit: boolean; evStart: string; onChange: () => void }) {
  const init = () => ({ pre: a.config.preEvent, guess: a.config.guessPhase });
  const [w, setW] = useState(init);
  const [saved, setSaved] = useState(() => JSON.stringify(init()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);
  useEffect(() => {
    const v = { pre: a.config.preEvent, guess: a.config.guessPhase };
    setW(v);
    setSaved(JSON.stringify(v));
  }, [a.config.preEvent, a.config.guessPhase]);
  const dirty = JSON.stringify(w) !== saved;
  const winOf = (x?: { opensBeforeDays?: number; closesBeforeDays?: number; opensTime?: string; closesTime?: string }) =>
    x ? { opensBeforeDays: x.opensBeforeDays, closesBeforeDays: x.closesBeforeDays, opensTime: x.opensTime, closesTime: x.closesTime } : undefined;

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}`, { method: "PATCH", body: { windows: { preEvent: winOf(w.pre), ...(w.guess ? { guessPhase: winOf(w.guess) } : {}) } } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setSaved(JSON.stringify(w));
    setMsg({ tone: "ok", text: "저장했어요 ✓" });
    onChange();
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ font: `700 ${fs(15)} var(--display)` }}>사전 작성 기간</b>
      <span className="small">“며칠 전”은 {a.startsAt ? "이 활동의 시작 일시" : "일정 시작 일시(활동 일시를 넣으면 활동 시작 기준)"}를 기준으로 해요. 0일 전은 그날이고, 시각을 비우면 기준 시각이에요.</span>
      <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <WindowFields id={`pw-${a.id}`} win={w.pre} defaults={{ open: 14, close: 1 }} eventStartsAt={evStart} onChange={(pre) => { setW({ ...w, pre }); setMsg(null); }} />
        {w.guess?.enabled && (
          <>
            <b style={{ fontSize: fs(14) }}>사전 맞히기 기간</b>
            <WindowFields id={`gw-${a.id}`} win={w.guess} defaults={{ open: 7, close: 1 }} eventStartsAt={evStart} onChange={(guess) => { setW({ ...w, guess }); setMsg(null); }} />
          </>
        )}
      </fieldset>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {canEdit && (
          <button className={`btn ${dirty ? "" : "white"}`} type="button" disabled={busy || !dirty} onClick={save}
            style={{ width: "auto", minWidth: 92, minHeight: 44, fontSize: fs(14) }}>
            {busy ? "저장 중…" : dirty ? "저장" : "저장됨"}
          </button>
        )}
        {msg ? <span className={msg.tone === "bad" ? "msg bad" : "small"} role={msg.tone === "bad" ? "alert" : "status"} style={msg.tone === "ok" ? { color: "var(--accent-ink)", fontWeight: 700 } : undefined}>{msg.text}</span>
          : dirty && canEdit ? <span className="small" role="status">바꾼 기간을 저장하려면 “저장”을 눌러 주세요.</span>
          : <span className="small">이 일정에서만 쓰는 기간이에요.</span>}
      </div>
    </div>
  );
}

// 활동참여자선택(예전 출석 체크): 일정에 넣은 활동에 참여할 사람을 고르고, 사람마다 전체참여 / 선택참여를 정한다.
//  전체참여: 활동 안의 모든 액션 / 선택참여: 템플릿 선별 조건에서 고른 액션만(템플릿이 "선택 참여 가능"일 때)
// 저장하면 완료돼 진행자가 활동을 시작할 수 있다. 고르지 않은 회원은 일정에 참석해도 이 활동에는 참여하지 않는다.
function Attendance({ eventId, a, canEdit, onChange }: { eventId: string; a: Act; canEdit: boolean; onChange: () => void }) {
  const base = `/api/admin/events/${eventId}/activities/${a.id}/attendance`;
  const [att, setAtt] = useState<Att | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [part, setPart] = useState<Set<string>>(new Set()); // 그중 선택참여
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const partialOk = canSelect(a.config);
  const actions = activityActions(a.config);
  const partialActs = actions.filter((x) => (a.config.partialActions ?? []).includes(x.key));

  const load = useCallback(async () => {
    const r = await api<Att>(base);
    if (r.ok) {
      setAtt(r.data);
      setSel(new Set(r.data.members.filter((m) => m.selected).map((m) => m.id)));
      setPart(new Set(r.data.members.filter((m) => m.selected && m.level === "partial").map((m) => m.id)));
      setDirty(false);
    } else setMsg({ tone: "bad", text: r.error });
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (m: Att["members"][number]) => {
    const n = new Set(sel);
    const p = new Set(part);
    if (n.has(m.id)) { n.delete(m.id); p.delete(m.id); }
    else {
      n.add(m.id);
      // 북공개 회원(소개 작성 활동)은 선택참여로만 넣는다
      if (m.bookBlocked) p.add(m.id);
    }
    setSel(n);
    setPart(p);
    setDirty(true);
  };
  const setLevel = (id: string, partial: boolean) => {
    const p = new Set(part);
    if (partial) p.add(id);
    else p.delete(id);
    setPart(p);
    setDirty(true);
  };

  // 선택 저장 = 고른 사람·참여 방식 저장 + 완료(한 명 이상일 때). 아무도 없으면 완료 상태를 푼다.
  async function onSave() {
    setBusy(true);
    setMsg(null);
    if (dirty) {
      const r = await api(base, { method: "PUT", body: { selected: [...sel], partial: [...part].filter((id) => sel.has(id)) } });
      if (!r.ok) {
        setBusy(false);
        return setMsg({ tone: "bad", text: r.error });
      }
    }
    const done = sel.size > 0;
    if (done !== att?.confirmed) {
      const r = await api(base, { body: { confirmed: done } });
      if (!r.ok) {
        setBusy(false);
        return setMsg({ tone: "bad", text: r.error });
      }
    }
    const np = [...part].filter((id) => sel.has(id)).length;
    setMsg({ tone: "info", text: done ? `${sel.size}명을 저장했어요(전체참여 ${sel.size - np}명 · 선택참여 ${np}명). 활동을 시작할 수 있어요.` : "아무도 고르지 않아 완료되지 않았어요. 참여할 사람을 골라 저장해 주세요." });
    setBusy(false);
    await load();
    onChange();
  }

  async function preset() {
    setBusy(true);
    const r = await api(base, { method: "PUT", body: { preset: "applicants" } });
    setMsg(r.ok ? { tone: "info", text: "일정에 참석을 신청한 회원으로 채웠어요(모두 전체참여). 필요하면 고쳐 주세요." } : { tone: "bad", text: r.error });
    setBusy(false);
    await load();
    onChange();
  }

  if (!att) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : null;
  const np = [...part].filter((id) => sel.has(id)).length;

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b style={{ font: `700 ${fs(16)} var(--display)` }}>활동참여자선택</b>
        <span className="pill blue">{sel.size}명{partialOk && np ? ` (선택참여 ${np})` : ""}</span>
        <span className={`pill ${att.confirmed ? "ok" : "warn"}`}>{att.confirmed ? "완료" : "미완료"}</span>
      </div>
      <div className="msg info" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>이 활동에 참여할 회원을 고르세요. 고르지 않은 회원은 일정에 참석해도 이 활동에는 참여하지 않아요.</span>
        {partialOk ? (
          <>
            <b>선택참여 회원 선별은 템플릿에서 선별 조건 확인 후 직접 회원을 선택하세요.</b>
            <span style={{ fontSize: fs(13) }}><b>전체참여</b> · 모든 액션 ({actions.map((x) => x.label).join(" → ") || "없음"})</span>
            <span style={{ fontSize: fs(13) }}><b>선택참여</b> · {partialActs.length ? partialActs.map((x) => x.label).join(" → ") : "템플릿 선별 조건에 고른 액션이 없어요"}</span>
          </>
        ) : <span className="small">이 활동은 템플릿에서 “전체 참여만”이라 고른 회원 모두 전체참여예요.</span>}
      </div>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="mini" type="button" disabled={busy} onClick={preset}>참석자로 채우기</button>
          <button className="mini" type="button" onClick={() => { setSel(new Set(att.members.filter((m) => partialOk || !m.bookBlocked).map((m) => m.id))); setPart(new Set(att.members.filter((m) => m.bookBlocked).map((m) => m.id))); setDirty(true); }}>전체 선택</button>
          <button className="mini" type="button" onClick={() => { setSel(new Set()); setPart(new Set()); setDirty(true); }}>전체 해제</button>
        </div>
      )}
      <span className="small" style={{ fontSize: fs(12) }}>참석·불참: 일정 신청 답 · 북공개: 프로필 북에 실명 소개가 공개됨{att.members.some((m) => m.bookBlocked) ? ` — 북공개 회원은 ${partialOk ? "선택참여로만 넣을 수 있어요" : "이 활동(전체 참여만)에 넣을 수 없어요"}. 전체참여가 필요하면 회원과 이야기해, 회원이 프로필 북 소개를 “승인 취소”로 내린 뒤 전체참여로 넣어 주세요(활동에서 인터뷰부터 새로 해요).` : ""}</span>
      <div className="checks" role="group" aria-label="활동 참여자">
        {att.members.map((m) => {
          const on = sel.has(m.id);
          return (
            <div key={m.id} className="row" style={{ gap: 6, flexWrap: "wrap", padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 10, ...(on ? { borderColor: "var(--blue)", background: "var(--blue-bg)" } : {}) }}>
              <label className="row grow" style={{ gap: 6, cursor: canEdit ? "pointer" : "default", border: 0, padding: 0, background: "none", minWidth: 0 }}>
                <input type="checkbox" checked={on} disabled={!canEdit || (m.bookBlocked && !partialOk)} onChange={() => toggle(m)} />
                {m.name}
                {m.answer && <span className={`pill ${m.answer === "참석" ? "ok" : "gray"}`}>{m.answer === "참석" ? "참석" : "불참"}</span>}
                {m.published && <span className="pill warn" title="프로필 북에 실명 소개가 공개된 회원">북공개</span>}
              </label>
              {on && partialOk && (
                <span className="seg" role="group" aria-label={`${m.name} 참여 방식`} style={{ flex: "0 0 auto" }}>
                  <button type="button" aria-pressed={!part.has(m.id)} disabled={!canEdit || m.bookBlocked} onClick={() => setLevel(m.id, false)} style={{ minHeight: 30, fontSize: fs(12), padding: "0 8px" }}>전체참여</button>
                  <button type="button" aria-pressed={part.has(m.id)} disabled={!canEdit} onClick={() => setLevel(m.id, true)} style={{ minHeight: 30, fontSize: fs(12), padding: "0 8px" }}>선택참여</button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={busy || (!dirty && att.confirmed === sel.size > 0)} style={{ width: "auto", minWidth: 160, minHeight: 46, fontSize: fs(15) }} onClick={onSave}>
            {busy ? "저장 중…" : "선택 저장"}
          </button>
          {dirty && <span className="small">저장하지 않은 변경이 있어요.</span>}
        </div>
      )}
      {att.confirmed && <span className="small">{fmtDateTime(att.confirmedAt)} ·{att.by} 님이 저장했어요. 늦게 온 분은 고르고 “선택 저장”을 누르면 바로 참여할 수 있어요.</span>}
    </div>
  );
}

// 소개 작성 현황(인원 수만). 승인 전 초안과 인터뷰 내용은 관리자에게도 보이지 않는다.
function Progress({ eventId, aid }: { eventId: string; aid: string }) {
  const [p, setP] = useState<{ total: number; approved: number; writing: number; notStarted: number; guessers: number } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof p>>(`/api/admin/events/${eventId}/activities/${aid}/progress`).then((r) => r.ok && setP(r.data));
  }, [eventId, aid]);
  if (!p) return null;
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <span className="pill ok">승인 {p.approved}명</span>
      <span className="pill warn">작성 중 {p.writing}명</span>
      <span className="pill gray">미작성 {p.notStarted}명</span>
      <span className="pill blue">맞히기 참여 {p.guessers}명</span>
      <span className="small">전체 {p.total}명 · 내용은 관리자에게도 보이지 않아요</span>
    </div>
  );
}

// 일정 관리의 '활동' 탭: 템플릿에서 활동 추가, 일정별 수정, 진행자 컨트롤(시험 조작)
export function EventActivities({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const [acts, setActs] = useState<Act[] | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api<{ members: { id: string; name: string }[] }>("/api/public/club").then((r) => r.ok && setMembers(r.data.members));
  }, []);
  // 진행자 화면의 "활동으로 돌아가기"(#act-활동id): 활동 목록을 불러온 뒤 그 활동으로 스크롤하고 잠깐 강조한다
  const scrolled = useRef(false);
  useEffect(() => {
    if (!acts || scrolled.current) return;
    const h = window.location.hash;
    if (!h.startsWith("#act-")) return;
    scrolled.current = true;
    const el = document.getElementById(h.slice(1));
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    el.classList.add("act-flash");
    window.setTimeout(() => el.classList.remove("act-flash"), 1800);
  }, [acts]);
  // 일정 시작 일시: 활동 설정의 사전 단계 기간을 실제 날짜·시각으로 미리 보여 주는 데 쓴다
  const [evStart, setEvStart] = useState("");
  useEffect(() => {
    api<{ event: { startsAt: string } }>(`/api/admin/events/${eventId}`).then((r) => r.ok && setEvStart(r.data.event.startsAt ?? ""));
  }, [eventId]);
  const [pick, setPick] = useState(""); // 고른 템플릿(v1 id)
  const [pickVer, setPickVer] = useState(""); // 고른 버전 id (버전이 2개 이상일 때 두 번째 단계에서)
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const fams = families(tpls).filter((f) => !f.root.config.bookOnly); // 프로필 북 전용 템플릿은 일정에 넣지 않는다
  const nextVerOf = (templateId: string) => fams.find((f) => f.versions.some((v) => v.id === templateId))?.nextVersion;
  const [edit, setEdit] = useState<{ id: string; value: EditableConfig; orig: string } | null>(null);
  const [editErr, setEditErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [guideFor, setGuideFor] = useState<Act | null>(null); // AI 지침을 고치는 활동
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([
      api<{ activities: Act[] }>(`/api/admin/events/${eventId}/activities`),
      api<{ templates: Tpl[] }>("/api/admin/templates"),
    ]);
    if (a.ok) setActs(a.data.activities);
    else setMsg({ tone: "bad", text: a.error });
    if (t.ok) {
      setTpls(t.data.templates);
      setPick((p) => p || families(t.data.templates).filter((f) => !f.root.config.bookOnly)[0]?.id || "");
    }
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  const pickFam = fams.find((f) => f.id === pick);
  // 1단계: 템플릿 고르기 → 버전이 2개 이상이면 2단계(버전 고르기, 처음엔 최신), 아니면 바로 넣는다
  function next() {
    if (!pickFam) return;
    if (pickFam.versions.length >= 2) {
      setPickVer(pickFam.latest.id);
      setAddErr("");
      setAddStep(2);
    } else add(pickFam.root.id);
  }

  async function add(templateId: string) {
    setBusy(true);
    setAddErr("");
    const r = await api(`/api/admin/events/${eventId}/activities`, { body: { templateId } });
    setBusy(false);
    if (!r.ok) return setAddErr(r.error);
    const v = tpls.find((t) => t.id === templateId);
    setMsg({ tone: "info", text: `활동을 넣었어요${v ? ` (${v.config.name} v${v.version})` : ""}. 이 일정에서 고칠 때 저장 방법(수정 · 새 버전 · 새 활동)을 골라요.` });
    setAddOpen(false);
    load();
  }

  // 저장 방법: fix(이 활동이 쓰는 템플릿 버전 고치기) / version(새 버전) / new(새 활동)
  async function saveEdit(mode: SaveMode = "version", name?: string) {
    if (!edit) return;
    setBusy(true);
    setEditErr("");
    const r = await api<{ mode?: SaveMode; unchanged?: boolean; version?: number; name?: string; propagated?: number }>(`/api/admin/events/${eventId}/activities/${edit.id}`, { method: "PATCH", body: { config: edit.value, mode, name } });
    setBusy(false);
    if (!r.ok) return setEditErr(r.error);
    setMsg({ tone: "info", text: r.data.version ? savedText(r.data, "활동 설정", true) : r.data.unchanged ? savedText(r.data, "활동 설정") : "이 일정의 활동 설정을 저장했어요." });
    setEdit(null);
    load();
  }
  // 이 활동이 쓰는 템플릿 버전과, 그 버전을 쓰는 다른 일정 수
  const tplOf = (a: Act | undefined) => (a ? tpls.find((x) => x.id === a.templateId) : undefined);
  const otherEventsOf = (t: Tpl | undefined) => (t ? t.useEvents.filter((e) => e !== eventId).length : 0);

  async function remove(a: Act) {
    if (!window.confirm(`“${a.config.name}” 활동을 이 일정에서 뺄까요?`)) return;
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}`, { method: "DELETE" });
    setMsg(r.ok ? { tone: "info", text: "뺐어요." } : { tone: "bad", text: r.error });
    load();
  }

  async function live(a: Act, body: { action: "activate"; step: string } | { action: "lock" } | { action: "reset" }) {
    const r = await api<{ warning?: string }>(`/api/admin/events/${eventId}/activities/${a.id}/live`, { body });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg(r.data.warning ? { tone: "info", text: r.data.warning } : null);
    load();
  }

  // 리허설 초기화: 진행 순서·거짓 투표·회원 화면·룰렛·뽑은 고민만 지운다(두 번 확인)
  async function rehearsalReset(a: Act) {
    if (!window.confirm(`“${a.config.name}”의 리허설 기록을 지울까요?\n\n지우는 것: 진행 순서(누구 차례까지 했는지), 거짓 투표, 점수, 동점자 룰렛, 뽑은 고민, 회원 화면 상태\n남기는 것: 소개 글, 2진실 1거짓, 사전 추측, 인터뷰, 고민 글, 출석·팀`)) return;
    if (!window.confirm("정말 지울까요? 지운 기록은 되돌릴 수 없어요.\n본 행사를 시작한 뒤에는 누르지 마세요.")) return;
    const r = await api<{ rounds: number; votes: number; worries: number }>(`/api/admin/events/${eventId}/activities/${a.id}/rehearsal-reset`, { body: {} });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: `리허설 기록을 지웠어요(진행 차례 ${r.data.rounds}개 · 투표 ${r.data.votes}개${r.data.worries ? ` · 뽑은 고민 ${r.data.worries}개` : ""}). 본 행사 때 처음부터 진행할 수 있어요.` });
    load();
  }

  if (guideFor) {
    const t = tpls.find((x) => x.id === guideFor.templateId);
    return (
      <AiGuidesEditor
        title={guideFor.config.name}
        keys={aiPointKeys(guideFor.config)}
        initial={{
          aiGuides: (t ?? guideFor).config.aiGuides ?? {},
          aiCommon: (t ?? guideFor).config.aiCommon,
          interview: (t ?? guideFor).config.interview,
        }}
        saveNote="이 활동의 원래 템플릿이 없어서 이 일정 활동에만 저장돼요."
        choices={t ? { version: t.version, nextVersion: nextVerOf(t.id) ?? t.version + 1, baseName: t.config.name, otherEvents: otherEventsOf(t), inEvent: true } : undefined}
        onClose={() => setGuideFor(null)}
        onSave={async (ai, mode, name) => {
          const r = await api<{ mode?: SaveMode; unchanged?: boolean; version: number; name?: string; propagated?: number }>(`/api/admin/events/${eventId}/activities/${guideFor.id}/ai-guides`, { method: "PUT", body: { ...ai, mode, name } });
          if (!r.ok) return r.error;
          setMsg({ tone: "info", text: r.data.version ? savedText(r.data, "AI 지침", true) : r.data.unchanged ? savedText(r.data, "AI 지침") : "AI 지침을 이 일정 활동에 저장했어요." });
          setGuideFor(null);
          load();
          return null;
        }}
      />
    );
  }


  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        활동 템플릿에서 활동을 골라 이 일정에 넣어요. 넣은 뒤 이 일정에 맞게 고칠 수 있어요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {!acts && !msg && <p className="small">불러오는 중이에요…</p>}
      {acts && acts.length === 0 && <div className="msg info">아직 넣은 활동이 없어요. “+ 템플릿에서 활동 추가”로 넣어 보세요.</div>}

      {acts?.map((a) => (
        <div key={a.id} id={`act-${a.id}`} className="card act-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <b style={{ font: `700 ${fs(18)} var(--display)` }}>{a.config.name}</b>
            <span className="pill gray">
              {(() => { const t = tpls.find((x) => x.id === a.templateId); return t?.config.sourceEvent ? `템플릿 v${t.version} · ${sourceLabel(t)}` : `템플릿 v${t?.version ?? a.templateVersion}`; })()}
            </span>
            <span className={`pill ${a.pre.enabled ? "blue" : "warn"}`}>{a.pre.enabled ? "사전 작성 있음" : "현장에서만"}</span>
            <span className="pill gray">{modeOf(a.config) === "team" ? "팀별" : "모두 함께"}</span>
            <span className="grow" />
            {canEdit && (
              <>
                <button className="mini" type="button" onClick={() => { const { id: _i, version: _v, ...rest } = a.config; void _i; void _v; setEditErr(""); setEdit({ id: a.id, value: rest, orig: JSON.stringify(rest) }); }}>수정</button>
                {aiPointKeys(a.config).length > 0 && (
                  <button className="mini" type="button" onClick={async () => {
                    setMsg(null);
                    // 열기 전에 최신 활동·템플릿을 다시 읽는다(페이지를 연 뒤 바뀐 값으로 편집하도록)
                    const [ra, rt] = await Promise.all([api<{ activities: Act[] }>(`/api/admin/events/${eventId}/activities`), api<{ templates: Tpl[] }>("/api/admin/templates")]);
                    if (rt.ok) setTpls(rt.data.templates);
                    if (ra.ok) setActs(ra.data.activities);
                    setGuideFor((ra.ok ? ra.data.activities.find((x) => x.id === a.id) : undefined) ?? a);
                  }}>
                    AI 지침{Object.values(tpls.find((x) => x.id === a.templateId)?.config.aiGuides ?? {}).some((v) => v.trim()) ? " ✓" : ""}
                  </button>
                )}
                <button className="mini danger" type="button" onClick={() => remove(a)}>빼기</button>
              </>
            )}
          </div>
          <span className="small">{PRE_TEXT[a.pre.status]}{a.pre.opensAt ? ` · ${fmtDateTime(a.pre.opensAt)} ~ ${fmtDateTime(a.pre.closesAt)}` : ""}</span>
          {a.config.preEvent.steps.includes("ai_interview") && <Progress eventId={eventId} aid={a.id} />}
          <span className="small">참여 범위: {canSelect(a.config) ? "선택 참여 가능 (회원마다 전체참여 / 선택참여)" : "전체 참여만"}{a.attendanceConfirmed ? ` · 참여자 ${a.rosterCount}명` : " · 참여자 선택 필요"}</span>
          <Attendance eventId={eventId} a={a} canEdit={canEdit} onChange={load} />
          <Schedule eventId={eventId} a={a} canEdit={canEdit} onChange={load} />
          {a.config.preEvent.enabled && <PreWindows eventId={eventId} a={a} canEdit={canEdit} evStart={a.startsAt || evStart} onChange={load} />}
          <HostSetting eventId={eventId} a={a} canEdit={canEdit} members={members} onChange={load} />
          {a.config.preEvent.steps.includes("worry_write") && (
            <Link href={`/host/worry/${eventId}/${a.id}`} className="btn blue" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: fs(16), textDecoration: "none" }}>
              진행자 전체화면 열기 (고민 뽑기) ⛶
            </Link>
          )}
          {!a.config.preEvent.steps.includes("ai_interview") && !a.config.preEvent.steps.includes("worry_write") && a.config.onsite.steps.some((s) => s.memberScreen === "write") ? (
            <CapsuleAdmin eventId={eventId} aid={a.id} canEdit={canEdit} />
          ) : modeOf(a.config) === "team" && (
            // 팀 활동: 팀 배정은 템플릿이 아니라 이 일정에서 한다
            <section className="card" aria-label="팀 배정" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--soft)" }}>
              <b style={{ font: `700 ${fs(17)} var(--display)` }}>팀 배정</b>
              <span className="small">이 일정의 참여자로 팀을 나눠요. 팀은 이 일정의 이 활동에만 쓰여요.</span>
              <TeamBoard base={`/api/admin/events/${eventId}/activities/${a.id}`} canEdit={canEdit} unit="팀" screenHref={`/host/teams/${eventId}/${a.id}`} copyFromEvent={eventId} />
            </section>
          )}
          {a.config.preEvent.steps.includes("ai_interview") && (
            <Link href={`/host/${eventId}/${a.id}`} className="btn blue" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: fs(16), textDecoration: "none" }}>
              진행자 전체화면 열기 ⛶
            </Link>
          )}

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ font: `700 ${fs(16)} var(--display)` }}>진행자 컨트롤</b>
            {a.config.host?.required && !a.hosts.length && <span className="small">진행자가 아직 없어요. 관리자는 여기서 직접 진행할 수 있어요.</span>}
            <div className="row" style={{ flexWrap: "wrap" }}>
              {a.config.onsite.steps.filter((s) => s.hostButton).map((s) => (
                <button key={s.key} className={`btn ${a.live.stepKey === s.key && a.live.unlocked ? "blue" : ""}`} type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: fs(16) }} onClick={() => live(a, { action: "activate", step: s.key })}>
                  {s.hostButton}
                </button>
              ))}
              {/* 잠그기 ↔ 다시 열기: 잠그면 회원 화면이 대기 화면, 다시 열면 지금 단계의 회원 화면이 다시 켜진다 */}
              {a.live.active && a.live.unlocked ? (
                <button className="btn red" type="button" title="회원 휴대폰 화면을 대기 화면으로 잠가요(투표 마감 등). 단계는 그대로예요." style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: fs(16) }} onClick={() => live(a, { action: "lock" })}>잠그기</button>
              ) : (
                <button className="btn" type="button" disabled={!a.live.active} title="잠근 회원 화면을 지금 단계로 다시 켜요" style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: fs(16) }} onClick={() => live(a, { action: "activate", step: a.live.stepKey })}>다시 열기</button>
              )}
              <button className="btn white" type="button" disabled={!a.live.active} title="현장 진행을 시작 전으로 되돌려요(받은 투표·답은 그대로)" style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: fs(16) }}
                onClick={() => window.confirm("현장 진행을 처음으로 되돌릴까요?\n진행 중인 단계가 비워지고 회원 화면이 잠겨요. 이미 받은 투표·답은 지우지 않아요.") && live(a, { action: "reset" })}>처음으로</button>
            </div>
            <div className="msg info" role="status">
              {a.live.active
                ? `현재 단계: ${a.live.stepLabel} · 회원 화면: ${a.live.unlocked ? `켜짐 (${screenLabel(a.config, a.live.memberScreen)})` : "잠김 (대기 화면)"}`
                : "현장 진행 전이에요. 버튼을 누르면 회원 화면이 템플릿 설정대로 바뀌어요."}
            </div>
            {canEdit && (
              <div className="row" style={{ gap: 8, flexWrap: "wrap", borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                <span className="small grow" style={{ fontSize: fs(12) }}>리허설을 해 봤다면 본 행사 전에 진행 기록을 지워 주세요. 소개 글·2진실 1거짓·사전 추측 등 미리 받은 내용은 남아요.</span>
                <button className="mini danger" type="button" style={{ fontSize: fs(12) }} onClick={() => rehearsalReset(a)}>리허설 기록 지우기</button>
              </div>
            )}
            <span className="small" style={{ fontSize: fs(12) }}>잠그기: 회원 화면을 대기 화면으로 잠가요(다시 열기로 지금 단계를 다시 켜요) · 처음으로: 현장 진행을 시작 전으로 되돌려요(받은 투표·답은 그대로). 진행자 전체화면으로 진행할 때는 전체화면 위쪽에서 잠그기·다시 열기를 바로 누를 수 있어요(처음으로는 리허설 뒤 정리용이라 여기에만 있어요).</span>
          </div>
        </div>
      ))}

      {canEdit && tpls.length > 0 && (
        <>
          <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={() => { setAddErr(""); setAddStep(1); setAddOpen(true); }}>+ 템플릿에서 활동 추가</button>
          <Popup id="activity-add" title={addStep === 2 && pickFam ? `버전 고르기 · ${pickFam.root.config.name}` : "템플릿에서 활동 추가"} open={addOpen} onClose={() => setAddOpen(false)}>
            {addStep === 1 || !pickFam ? (
              <form onSubmit={(e) => { e.preventDefault(); next(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {addErr && <div className="msg bad" role="alert">{addErr}</div>}
                <div>
                  <label className="l" htmlFor="act-pick">활동 템플릿</label>
                  <select id="act-pick" className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
                    {fams.map((f) => <option key={f.id} value={f.id}>{f.root.config.name}{f.versions.length >= 2 ? ` (버전 ${f.versions.length}개)` : ""}</option>)}
                  </select>
                </div>
                {pickFam && (
                  <span className="small">
                    {pickFam.root.config.description ? `${pickFam.root.config.description} · ` : ""}{modeOf(pickFam.root.config) === "team" ? "팀별" : "모두 함께"} · {pickFam.root.config.preEvent.enabled ? "사전 작성 있음" : "현장에서만"} · 현장 {pickFam.root.config.onsite.steps.length}단계
                  </span>
                )}
                <span className="small">
                  {pickFam && pickFam.versions.length >= 2
                    ? "이 템플릿은 버전이 여러 개라서 다음 단계에서 쓸 버전을 골라요."
                    : "템플릿 설정이 복사돼요. 이 일정에서 고칠 때 수정 · 새 버전 · 새 활동 중에서 골라 저장해요."}
                </span>
                <button className="btn" type="submit" disabled={busy || !pickFam} style={{ width: "auto", minWidth: 140, alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }}>
                  {pickFam && pickFam.versions.length >= 2 ? "다음: 버전 고르기" : busy ? "넣는 중…" : "추가"}
                </button>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); add(pickVer); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {addErr && <div className="msg bad" role="alert">{addErr}</div>}
                <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <legend className="l">쓸 버전 (최신 버전부터)</legend>
                  {pickFam.versions.map((v) => (
                    <label key={v.id} className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", ...(pickVer === v.id ? { borderColor: "var(--blue)", background: "var(--blue-bg)" } : {}) }}>
                      <input type="radio" name="act-ver" value={v.id} checked={pickVer === v.id} onChange={() => setPickVer(v.id)} style={{ marginTop: 4 }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="row" style={{ flexWrap: "wrap" }}>
                          <b>{v.config.name}</b>
                          <span className={`pill ${v.version === 1 ? "ok" : "blue"}`}>v{v.version}</span>
                          {v.id === pickFam.latest.id && <span className="pill warn">최신</span>}
                        </span>
                        <span className="small">{sourceLabel(v)}{v.createdAt ? ` · ${fmtDate(v.createdAt)}` : ""}</span>
                        <span className="small">{modeOf(v.config) === "team" ? "팀별" : "모두 함께"} · {v.config.preEvent.enabled ? "사전 작성 있음" : "현장에서만"} · 현장 {v.config.onsite.steps.length}단계</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button className="btn white" type="button" style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: fs(15) }} onClick={() => setAddStep(1)}>이전</button>
                  <button className="btn" type="submit" disabled={busy || !pickVer} style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: fs(15) }}>{busy ? "넣는 중…" : "이 버전으로 추가"}</button>
                </div>
              </form>
            )}
          </Popup>
        </>
      )}

      <Popup
        id="activity-editor"
        width={900}
        title={edit ? `활동 설정 수정 · ${edit.value.name}` : "활동 설정 수정"}
        open={!!edit}
        onClose={() => setEdit(null)}
        dirty={!!edit && JSON.stringify(edit.value) !== edit.orig}
        footer={edit && (() => {
          const t = tplOf(acts?.find((x) => x.id === edit.id));
          return t ? (
            <SaveChoices
              busy={busy}
              disabled={!edit.value.name.trim()}
              version={t.version}
              nextVersion={nextVerOf(t.id) ?? t.version + 1}
              baseName={t.config.name}
              suggestName={edit.value.name !== t.config.name ? edit.value.name : `${t.config.name} (새 활동)`}
              otherEvents={otherEventsOf(t)}
              inEvent
              onSave={saveEdit}
              onCancel={() => setEdit(null)}
            />
          ) : (
            <>
              <button className="btn white" type="button" style={{ width: "auto", minWidth: 110, minHeight: 48 }} onClick={() => setEdit(null)}>취소</button>
              <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 140, minHeight: 48 }} onClick={() => saveEdit("fix")}>{busy ? "저장 중…" : "저장"}</button>
            </>
          );
        })()}
      >
        {edit && (
          <>
            <span className="small">
              {(() => {
                const act = acts?.find((x) => x.id === edit.id);
                const t = act ? tpls.find((x) => x.id === act.templateId) : undefined;
                const others = otherEventsOf(t);
                return t
                  ? `이 활동은 “${t.config.name}” v${t.version}을 써요. 고친 뒤 아래에서 저장 방법을 골라요. 수정은 v${t.version}을 고치고${others ? `(이 버전을 쓰는 다른 일정 ${others}곳에도 반영)` : ""}, 새 버전은 v${nextVerOf(t.id) ?? t.version + 1}로 저장해 이 일정 활동이 그 버전을 쓰고, 새 활동은 다른 이름의 새 템플릿(v1)으로 저장해 이 일정 활동이 그것을 써요.`
                  : "이 활동의 원래 템플릿이 없어서 이 일정 활동에만 저장돼요.";
              })()}
            </span>
            {editErr && <div className="msg bad" role="alert">{editErr}</div>}
            <AiAssist value={edit.value} eventId={eventId} templateId={acts?.find((x) => x.id === edit.id)?.templateId} onApply={(value) => setEdit({ ...edit, value })} />
            <TemplateEditor value={edit.value} eventStartsAt={evStart} inEvent onChange={(value) => setEdit({ ...edit, value })} />
          </>
        )}
      </Popup>
    </>
  );
}
