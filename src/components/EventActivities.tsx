"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import type { TemplateConfig } from "@/lib/template-schema";
import { CapsuleAdmin } from "./CapsuleAdmin";
import { DateField } from "./DateField";
import { AiGuidesEditor, aiPointKeys } from "./AiGuidesEditor";
import { Popup } from "./Popup";
import { TeamBoard } from "./TeamBoard";
import { modeOf, SCREEN_LABELS, TemplateEditor, type EditableConfig } from "./TemplateEditor";
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
  hostId: string;
  hostCode: string;
};
type Tpl = { id: string; origin?: string; config: TemplateConfig };
// 템플릿 이름(행사 템플릿이면 "이름 (행사명_날짜)")
const tplLabel = (t?: Tpl) =>
  !t ? "" : t.origin === "event" && t.config.sourceEvent ? `${t.config.name} (${t.config.sourceEvent.name}_${t.config.sourceEvent.date})` : t.config.name;
type Att = {
  confirmed: boolean; confirmedAt: string; by: string; selectedCount: number;
  members: { id: string; name: string; answer: string; days: string; selected: boolean }[];
};

const PRE_TEXT: Record<string, string> = {
  none: "현장에서만 진행 (사전 작성 없음)",
  unknown: "사전 작성 있음 · 행사 날짜가 정해지면 기간이 계산돼요",
  before: "사전 작성 시작 전",
  open: "사전 작성 중",
  closed: "사전 작성 마감",
};

// 사회자 지정: 회원 중 한 명 + 사회자 접속번호. 사회자는 이 번호로 로그인하면 활동 진행 화면만 보고,
// 평소 초대코드로 로그인하면 일반 회원으로 활동에 참여한다.
function HostSetting({ eventId, a, canEdit, members, onChange }: {
  eventId: string; a: Act; canEdit: boolean; members: { id: string; name: string }[]; onChange: () => void;
}) {
  const [hostId, setHostId] = useState(a.hostId);
  const [code, setCode] = useState(a.hostCode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const dirty = hostId !== a.hostId || code !== a.hostCode;
  const hostName = members.find((m) => m.id === a.hostId)?.name ?? "";

  async function save(clear = false) {
    setBusy(true);
    setMsg(null);
    const body = clear ? { hostId: "", hostCode: "" } : { hostId, hostCode: code };
    const r = await api<{ hostId: string; hostCode: string }>(`/api/admin/events/${eventId}/activities/${a.id}/host`, { method: "PUT", body });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setHostId(r.data.hostId);
    setCode(r.data.hostCode);
    setMsg({ tone: "info", text: clear ? "사회자 지정을 풀었어요." : "사회자를 저장했어요. 사회자에게 접속번호를 알려 주세요." });
    onChange();
  }

  function suggest() {
    setCode(String(Math.floor(100000 + Math.random() * 900000)));
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ font: `700 ${fs(16)} var(--display)` }}>사회자</b>
      <span className="small">
        사회자가 로그인 화면에서 자기 이름을 고르고 <b>사회자 접속번호</b>를 넣으면 이 활동의 진행 화면만 보여요.
        평소 초대코드(연락처 뒷자리)로 들어오면 일반 회원으로 활동에 참여해요.
      </span>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="grid2">
        <div>
          <label className="l" htmlFor={`hs-${a.id}`}>사회자 (회원 중 선택)</label>
          <select id={`hs-${a.id}`} className="field" value={hostId} disabled={!canEdit || busy} onChange={(e) => setHostId(e.target.value)}>
            <option value="">정하지 않음</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="l" htmlFor={`hc-${a.id}`}>사회자 접속번호 (숫자 4~8자리)</label>
          <div className="row">
            <input id={`hc-${a.id}`} className="field" inputMode="numeric" maxLength={8} value={code} disabled={!canEdit || busy || !hostId}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            {canEdit && <button className="mini" type="button" disabled={busy || !hostId} style={{ minHeight: 46, whiteSpace: "nowrap" }} onClick={suggest}>자동 생성</button>}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={busy || !dirty || (Boolean(hostId) && code.length < 4)} style={{ width: "auto", minWidth: 140, minHeight: 46, fontSize: fs(15) }} onClick={() => save()}>
            {busy ? "저장 중…" : "사회자 저장"}
          </button>
          {a.hostId && <button className="btn white" type="button" disabled={busy} style={{ width: "auto", minHeight: 46, fontSize: fs(15) }} onClick={() => save(true)}>지정 풀기</button>}
        </div>
      )}
      {a.hostId && !dirty && <span className="small">지금 사회자: {hostName} · 접속번호 {a.hostCode}</span>}
    </div>
  );
}

// 활동의 날짜와 진행 시간. 회원에게 알려 주는 안내용 정보이고, 참여 대상과는 연결하지 않는다.
function Schedule({ eventId, a, canEdit, onChange }: { eventId: string; a: Act; canEdit: boolean; onChange: () => void }) {
  const [s, setS] = useState(a.startsAt);
  const [e, setE] = useState(a.endsAt);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);

  async function save() {
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}/schedule`, { method: "PUT", body: { startsAt: s, endsAt: e } });
    setMsg(r.ok ? { tone: "info", text: "활동 일시를 저장했어요." } : { tone: "bad", text: r.error });
    if (r.ok) onChange();
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ font: `700 ${fs(16)} var(--display)` }}>활동 날짜와 진행 시간</b>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="grid2">
        <div><label className="l" htmlFor={`as-${a.id}`}>시작 일시</label><DateField id={`as-${a.id}`} mode="datetime" value={s} disabled={!canEdit} onChange={setS} /></div>
        <div><label className="l" htmlFor={`ae-${a.id}`}>끝나는 일시</label><DateField id={`ae-${a.id}`} mode="datetime" value={e} disabled={!canEdit} onChange={setE} /></div>
      </div>
      <span className="small">회원에게 보여 주는 안내용 정보예요. 참여 대상은 아래 “출석 체크”에서 따로 정해요.</span>
      {canEdit && <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={save}>일시 저장</button>}
    </div>
  );
}

// 출석 체크(참여 대상이 “관리자 선택 회원”일 때): 활동 전에 참여할 사람을 고르고 완료한다.
// 완료해야 사회자가 활동을 시작할 수 있고, 선택된 회원만 활동에 참여하고 정보가 노출된다.
function Attendance({ eventId, a, canEdit, onChange }: { eventId: string; a: Act; canEdit: boolean; onChange: () => void }) {
  const base = `/api/admin/events/${eventId}/activities/${a.id}/attendance`;
  const [att, setAtt] = useState<Att | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Att>(base);
    if (r.ok) {
      setAtt(r.data);
      setSel(new Set(r.data.members.filter((m) => m.selected).map((m) => m.id)));
      setDirty(false);
    } else setMsg({ tone: "bad", text: r.error });
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
    setDirty(true);
  };

  async function saveSel(): Promise<boolean> {
    const r = await api(base, { method: "PUT", body: { selected: [...sel] } });
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    return r.ok;
  }
  // 선택 저장 = 고른 사람 저장 + 출석 체크 완료(한 명 이상일 때). 아무도 없으면 완료 상태를 푼다.
  async function onSave() {
    setBusy(true);
    setMsg(null);
    if (dirty && !(await saveSel())) return setBusy(false);
    const done = sel.size > 0;
    if (done !== att?.confirmed) {
      const r = await api(base, { body: { confirmed: done } });
      if (!r.ok) {
        setBusy(false);
        return setMsg({ tone: "bad", text: r.error });
      }
    }
    setMsg({ tone: "info", text: done ? `${sel.size}명을 저장했어요. 출석 체크가 완료돼 활동을 시작할 수 있어요.` : "아무도 선택하지 않아 출석 체크가 완료되지 않았어요. 참여할 사람을 골라 저장해 주세요." });
    setBusy(false);
    await load();
    onChange();
  }
  async function preset() {
    setBusy(true);
    const r = await api(base, { method: "PUT", body: { preset: "applicants" } });
    setMsg(r.ok ? { tone: "info", text: "행사에 참석을 신청한 회원으로 채웠어요. 필요하면 고쳐 주세요." } : { tone: "bad", text: r.error });
    setBusy(false);
    await load();
    onChange();
  }

  if (!att) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : null;

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b style={{ font: `700 ${fs(16)} var(--display)` }}>출석 체크 (참여할 사람 선택)</b>
        <span className="pill blue">선택 {sel.size}명</span>
        <span className={`pill ${att.confirmed ? "ok" : "warn"}`}>{att.confirmed ? "완료" : "활동 전에 완료해 주세요"}</span>
      </div>
      {!att.confirmed && <div className="msg info">참여할 사람을 고르고 아래 “선택 저장”을 누르면 출석 체크가 완료돼 사회자가 활동을 시작할 수 있어요. 선택하지 않은 회원은 활동에 들어가지 않아요.</div>}
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="mini" type="button" disabled={busy} onClick={preset}>행사 참석 신청자로 채우기</button>
          <button className="mini" type="button" onClick={() => { setSel(new Set(att.members.map((m) => m.id))); setDirty(true); }}>전체 선택</button>
          <button className="mini" type="button" onClick={() => { setSel(new Set()); setDirty(true); }}>전체 해제</button>
        </div>
      )}
      <div className="checks" role="group" aria-label="참여할 사람">
        {att.members.map((m) => (
          <label key={m.id} style={sel.has(m.id) ? { borderColor: "var(--blue)", background: "var(--blue-bg)" } : undefined}>
            <input type="checkbox" checked={sel.has(m.id)} disabled={!canEdit} onChange={() => toggle(m.id)} />
            {m.name}
            {m.answer && <span className={`pill ${m.answer === "참석" ? "ok" : "gray"}`}>{m.answer === "참석" ? "행사 신청" : "불참"}</span>}
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={busy || (!dirty && att.confirmed === sel.size > 0)} style={{ width: "auto", minWidth: 160, minHeight: 46, fontSize: fs(15) }} onClick={onSave}>
            {busy ? "저장 중…" : "선택 저장"}
          </button>
          {dirty && <span className="small">저장하지 않은 변경이 있어요.</span>}
        </div>
      )}
      {att.confirmed && <span className="small">{fmtDateTime(att.confirmedAt)} ·{att.by} 님이 저장했어요. 늦게 온 분은 선택하고 “선택 저장”을 누르면 바로 참여할 수 있어요.</span>}
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

// 행사 관리의 '활동' 탭: 템플릿에서 활동 추가, 행사별 수정, 사회자 컨트롤(시험 조작)
export function EventActivities({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const [acts, setActs] = useState<Act[] | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api<{ members: { id: string; name: string }[] }>("/api/public/club").then((r) => r.ok && setMembers(r.data.members));
  }, []);
  const [pick, setPick] = useState("");
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
      setPick((p) => p || t.data.templates[0]?.id || "");
    }
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setBusy(true);
    setAddErr("");
    const r = await api(`/api/admin/events/${eventId}/activities`, { body: { templateId: pick } });
    setBusy(false);
    if (!r.ok) return setAddErr(r.error);
    setMsg({ tone: "info", text: "활동을 넣었어요. 템플릿 설정이 복사돼서 이 행사에서만 따로 고칠 수 있어요." });
    setAddOpen(false);
    load();
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    setEditErr("");
    const r = await api(`/api/admin/events/${eventId}/activities/${edit.id}`, { method: "PATCH", body: edit.value });
    setBusy(false);
    if (!r.ok) return setEditErr(r.error);
    setMsg({ tone: "info", text: "이 행사의 활동 설정을 저장했어요." });
    setEdit(null);
    load();
  }

  async function remove(a: Act) {
    if (!window.confirm(`“${a.config.name}” 활동을 이 행사에서 뺄까요?`)) return;
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}`, { method: "DELETE" });
    setMsg(r.ok ? { tone: "info", text: "뺐어요." } : { tone: "bad", text: r.error });
    load();
  }

  async function live(a: Act, body: { action: "activate"; step: string } | { action: "lock" } | { action: "reset" }) {
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}/live`, { body });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg(null);
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
        scope="event"
        templateName={tplLabel(t) || guideFor.config.name}
        onClose={() => setGuideFor(null)}
        onSave={async (ai, target) => {
          const r = await api<{ label?: string; templateName?: string }>(`/api/admin/events/${eventId}/activities/${guideFor.id}/ai-guides`, { method: "PUT", body: { ...ai, target } });
          if (!r.ok) return r.error;
          setMsg({
            tone: "info",
            text: target === "template"
              ? `AI 지침을 “${r.data.templateName ?? "원래"}” 템플릿에도 반영했어요. 이 템플릿을 쓰는 다른 행사 활동에도 적용돼요.`
              : `AI 지침을 이 행사 활동에만 저장했어요.${r.data.label ? ` 템플릿 보관함에 “행사 템플릿 · ${r.data.label}”로 보여요.` : ""}`,
          });
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
        활동 템플릿에서 활동을 골라 이 행사에 넣어요. 넣은 뒤 이 행사에 맞게 고칠 수 있어요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {!acts && !msg && <p className="small">불러오는 중이에요…</p>}
      {acts && acts.length === 0 && <div className="msg info">아직 넣은 활동이 없어요. “+ 템플릿에서 활동 추가”로 넣어 보세요.</div>}

      {acts?.map((a) => (
        <div key={a.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <b style={{ font: `700 ${fs(18)} var(--display)` }}>{a.config.name}</b>
            <span className="pill gray">
              {(() => { const t = tpls.find((x) => x.id === a.templateId); return t?.origin === "event" && t.config.sourceEvent ? `행사 템플릿 · ${t.config.sourceEvent.name}_${t.config.sourceEvent.date}` : `템플릿 v${a.templateVersion}`; })()}
            </span>
            <span className={`pill ${a.pre.enabled ? "blue" : "warn"}`}>{a.pre.enabled ? "사전 작성 있음" : "현장에서만"}</span>
            <span className="pill gray">{modeOf(a.config) === "team" ? "팀 활동" : "전체 활동"}</span>
            <span className="grow" />
            {canEdit && (
              <>
                <button className="mini" type="button" onClick={() => { const { id: _i, version: _v, ...rest } = a.config; void _i; void _v; setEditErr(""); setEdit({ id: a.id, value: rest, orig: JSON.stringify(rest) }); }}>수정</button>
                {aiPointKeys(a.config).length > 0 && (
                  <button className="mini" type="button" onClick={() => { setMsg(null); setGuideFor(a); }}>
                    AI 지침{Object.values(tpls.find((x) => x.id === a.templateId)?.config.aiGuides ?? {}).some((v) => v.trim()) ? " ✓" : ""}
                  </button>
                )}
                <button className="mini danger" type="button" onClick={() => remove(a)}>빼기</button>
              </>
            )}
          </div>
          <span className="small">{PRE_TEXT[a.pre.status]}{a.pre.opensAt ? ` · ${fmtDate(a.pre.opensAt)} ~ ${fmtDate(a.pre.closesAt)}` : ""}</span>
          {a.config.preEvent.steps.includes("ai_interview") && <Progress eventId={eventId} aid={a.id} />}
          <span className={`pill ${a.config.participants === "selected" ? "warn" : "gray"}`} style={{ alignSelf: "flex-start" }}>
            참여 대상: {a.config.participants === "selected" ? `관리자 선택 회원 (${a.rosterCount}명${a.attendanceConfirmed ? " · 출석 체크 완료" : " · 출석 체크 필요"})` : "전체 회원"}
          </span>
          {a.config.participants === "selected" && <Attendance eventId={eventId} a={a} canEdit={canEdit} onChange={load} />}
          <Schedule eventId={eventId} a={a} canEdit={canEdit} onChange={load} />
          <HostSetting eventId={eventId} a={a} canEdit={canEdit} members={members} onChange={load} />
          {a.config.preEvent.steps.includes("worry_write") && (
            <Link href={`/host/worry/${eventId}/${a.id}`} className="btn blue" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: fs(16), textDecoration: "none" }}>
              사회자 전체화면 열기 (고민 뽑기) ⛶
            </Link>
          )}
          {!a.config.preEvent.steps.includes("ai_interview") && !a.config.preEvent.steps.includes("worry_write") && a.config.onsite.steps.some((s) => s.memberScreen === "write") ? (
            <CapsuleAdmin eventId={eventId} aid={a.id} canEdit={canEdit} />
          ) : modeOf(a.config) === "team" && (
            // 팀 활동: 팀 배정은 템플릿이 아니라 이 행사에서 한다
            <section className="card" aria-label="팀 배정" style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--soft)" }}>
              <b style={{ font: `700 ${fs(17)} var(--display)` }}>팀 배정</b>
              <span className="small">이 행사의 참여자로 팀을 나눠요. 팀은 이 행사의 이 활동에만 쓰여요.</span>
              <TeamBoard base={`/api/admin/events/${eventId}/activities/${a.id}/teams`} canEdit={canEdit} unit="팀" screenHref={`/host/teams/${eventId}/${a.id}`} />
            </section>
          )}
          {a.config.preEvent.steps.includes("ai_interview") && (
            <Link href={`/host/${eventId}/${a.id}`} className="btn blue" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: fs(16), textDecoration: "none" }}>
              사회자 전체화면 열기 ⛶
            </Link>
          )}

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ font: `700 ${fs(16)} var(--display)` }}>사회자 컨트롤</b>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {a.config.onsite.steps.filter((s) => s.hostButton).map((s) => (
                <button key={s.key} className={`btn ${a.live.stepKey === s.key && a.live.unlocked ? "blue" : ""}`} type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: fs(16) }} onClick={() => live(a, { action: "activate", step: s.key })}>
                  {s.hostButton}
                </button>
              ))}
              <button className="btn red" type="button" disabled={!a.live.active || !a.live.unlocked} style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: fs(16) }} onClick={() => live(a, { action: "lock" })}>잠그기</button>
              <button className="btn white" type="button" disabled={!a.live.active} style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: fs(16) }} onClick={() => live(a, { action: "reset" })}>처음으로</button>
            </div>
            <div className="msg info" role="status">
              {a.live.active
                ? `현재 단계: ${a.live.stepLabel} · 회원 화면: ${a.live.unlocked ? `켜짐 (${SCREEN_LABELS[a.live.memberScreen] ?? a.live.memberScreen})` : "잠김 (대기 화면)"}`
                : "현장 진행 전이에요. 버튼을 누르면 회원 화면이 템플릿 설정대로 바뀌어요."}
            </div>
          </div>
        </div>
      ))}

      {canEdit && tpls.length > 0 && (
        <>
          <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }} onClick={() => { setAddErr(""); setAddOpen(true); }}>+ 템플릿에서 활동 추가</button>
          <Popup id="activity-add" title="템플릿에서 활동 추가" open={addOpen} onClose={() => setAddOpen(false)}>
            <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {addErr && <div className="msg bad" role="alert">{addErr}</div>}
              <div>
                <label className="l" htmlFor="act-pick">활동 템플릿</label>
                <select id="act-pick" className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
                  {tpls.map((t) => <option key={t.id} value={t.id}>{tplLabel(t)}</option>)}
                </select>
              </div>
              {(() => {
                const t = tpls.find((x) => x.id === pick);
                return t ? (
                  <span className="small">
                    {t.config.description ? `${t.config.description} · ` : ""}{modeOf(t.config) === "team" ? "팀 활동" : "전체 활동"} · {t.config.preEvent.enabled ? "사전 작성 있음" : "현장에서만"} · 현장 {t.config.onsite.steps.length}단계
                  </span>
                ) : null;
              })()}
              <span className="small">템플릿 설정이 복사돼서 이 행사에서만 따로 고칠 수 있어요.</span>
              <button className="btn" type="submit" disabled={busy || !pick} style={{ width: "auto", minWidth: 140, alignSelf: "flex-start", minHeight: 48, fontSize: fs(15) }}>추가</button>
            </form>
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
        footer={edit && (
          <>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 110, minHeight: 48 }} onClick={() => setEdit(null)}>취소</button>
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 140, minHeight: 48 }} onClick={saveEdit}>저장</button>
          </>
        )}
      >
        {edit && (
          <>
            <span className="small">여기서 고친 내용은 이 행사에만 적용돼요. 템플릿 보관함은 바뀌지 않아요.</span>
            {editErr && <div className="msg bad" role="alert">{editErr}</div>}
            <TemplateEditor value={edit.value} onChange={(value) => setEdit({ ...edit, value })} />
          </>
        )}
      </Popup>
    </>
  );
}
