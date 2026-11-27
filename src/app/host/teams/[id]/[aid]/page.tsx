"use client";

import { HostBack, HostDenied } from "@/components/HostBack";
import { HostLiveControls } from "@/components/HostLiveControls";
import { SfxToggle } from "@/components/SfxToggle";
import { playSfx } from "@/lib/sfx";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useTeamParam } from "@/components/TeamScope";

type Team = { id: string; name: string; members: { id: string; name: string; ageGroup: string }[] };
type Data = { teams: Team[]; published: boolean };
const NL = String.fromCharCode(10); // 확인 창 줄바꿈
type PactMember = { id: string; name: string; goal: boolean; pactOk: boolean };
type PactState = Record<string, { pacts: string[]; saved: boolean; sealed: boolean; members: PactMember[] }>;

// 타임캡슐 진행(조마다): 조원별 1년 뒤 목표 봉인·팀 약속 저장 현황 + 팀 약속 입력 → 조원 확인 → 진행자 봉인
function PactBox({ eventId, aid, teamId, st, reload, next }: { eventId: string; aid: string; teamId: string; st: PactState[string]; reload: () => void; next?: { href: string; name: string } | null }) {
  const [p, setP] = useState<string[]>(["", ""]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  // 저장된 약속을 칸에 넣는다. 고치는 중에는 덮어쓰지 않는다
  useEffect(() => { if (!touched && st.pacts.length === 2) setP(st.pacts); }, [st.pacts, touched]);
  const ms = st.members;
  // 봉인되면 "철컥"(처음 열 때는 소리 없이)
  const wasSealed = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasSealed.current === false && st.sealed) playSfx("lock");
    wasSealed.current = st.sealed;
  }, [st.sealed]);
  const goals = ms.filter((m) => m.goal).length, oks = ms.filter((m) => m.pactOk).length;
  async function savePact() {
    setBusy(true);
    setMsg("");
    const r = await api(`/api/admin/events/${eventId}/activities/${aid}/capsule/pact`, { method: "PUT", body: { teamId, pacts: p } });
    setBusy(false);
    setMsg(r.ok ? "저장했어요. 조원 휴대폰에 약속이 보여요. 조원이 한 명씩 확인하고 “팀 약속 저장하기”를 눌러요." : r.error);
    if (r.ok) setTouched(false);
    reload();
  }
  async function seal() {
    const notGoal = ms.filter((m) => !m.goal).map((m) => m.name), notOk = ms.filter((m) => !m.pactOk).map((m) => m.name);
    const left = [notGoal.length ? `목표 봉인 전: ${notGoal.join(", ")}` : "", notOk.length ? `약속 저장 전: ${notOk.join(", ")}` : ""].filter(Boolean).join(NL);
    if (!window.confirm((left ? "아직 끝나지 않은 조원이 있어요." + NL + left + NL + NL : "") + "타임캡슐을 봉인할까요? 봉인하면 열림 일시 전에는 아무도 볼 수 없고 더 쓸 수 없어요.")) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${eventId}/activities/${aid}/live?team=${encodeURIComponent(teamId)}`, { body: { action: "activate", step: "seal" } });
    setBusy(false);
    setMsg(r.ok ? "봉인했어요." : r.error);
    reload();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: 12 }}>
      {st.sealed ? (
        <>
          <div className="msg info" role="status" style={{ fontSize: 20 }}>봉인 완료 ✓ · 열림 일시가 되면 회원 화면에서 볼 수 있어요.</div>
          {/* 봉인한 뒤 다음 활동 진행 화면으로 바로 */}
          {next && <a className="btn blue" href={next.href} style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 64, fontSize: 22 }}>다음 활동으로 이동 › {next.name}</a>}
        </>
      ) : (
        <>
          <b style={{ fontSize: 24 }}>우리 팀 약속 2가지 {st.saved && <span className="pill ok" style={{ fontSize: 14 }}>조원에게 보임</span>}</b>
          <span className="sub" style={{ fontSize: 16 }}>팀원과 이야기해서 정한 약속을 적고 “저장”을 누르면 조원 휴대폰에 보여요. 조원이 모두 저장하면 “봉인하기”를 눌러 주세요.</span>
          {[0, 1].map((i) => (
            <input key={i} id={`pact-${teamId}-${i}`} className="field" maxLength={200} placeholder={`약속 ${i + 1}`} value={p[i]} disabled={busy}
              style={{ minHeight: 56, fontSize: 22 }} onChange={(e) => { setTouched(true); setP((cur) => cur.map((x, j) => (j === i ? e.target.value : x))); }} />
          ))}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn white" type="button" disabled={busy || !p[0].trim() || !p[1].trim()} style={{ width: "auto", flex: "1 1 160px", minHeight: 56, fontSize: 20 }} onClick={savePact}>{st.saved ? "고쳐서 다시 저장" : "저장"}</button>
            <button className="btn" type="button" disabled={busy || !st.saved} style={{ width: "auto", flex: "1 1 200px", minHeight: 56, fontSize: 20 }} onClick={seal}>봉인하기{st.saved && oks === ms.length && goals === ms.length ? " (모두 완료)" : ""}</button>
          </div>
          {st.saved && touched && <span className="sub" style={{ fontSize: 16 }}>약속을 고쳐서 다시 저장하면 조원이 다시 확인하고 저장해야 해요.</span>}
        </>
      )}
      {msg && <span role="status" style={{ fontSize: 18 }}>{msg}</span>}
    </div>
  );
}

// 팀 구성 결과를 큰 화면에 보여 준다.
// ?team=조 id 로 열면(조 진행자의 "○조 진행하기") 그 조만 보이고, 위쪽에서 그 조의 단계를 열고 잠근다.
export default function TeamsScreen({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [published, setPublished] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const [team] = useTeamParam();
  const [pacts, setPacts] = useState<PactState | null>(null); // 타임캡슐 활동이면 조별 팀 약속 상태
  const [next, setNext] = useState<{ href: string; name: string } | null>(null); // 봉인 뒤 다음 활동
  const loadPacts = useCallback(async () => {
    const r = await api<{ teams: PactState; next?: { href: string; name: string } | null }>(`/api/admin/events/${id}/activities/${aid}/capsule/pact${team ? `?team=${encodeURIComponent(team)}` : ""}`);
    setPacts(r.ok ? r.data.teams : null);
    setNext(r.ok ? r.data.next ?? null : null);
  }, [id, aid, team]);
  // 조원이 목표를 봉인하고 약속을 저장하는 것을 바로 보이게 3초마다
  useEffect(() => { loadPacts(); const t = setInterval(() => document.visibilityState === "visible" && loadPacts(), 3000); return () => clearInterval(t); }, [loadPacts]);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/events/${id}/activities/${aid}/teams`);
    if (r.ok) {
      setTeams(r.data.teams);
      setPublished(r.data.published);
    }
    else if (r.status === 401 || r.status === 403) setDenied(true);
    else setError(r.error);
  }, [id, aid]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (denied) return <HostDenied />;

  return (
    <div className="host" ref={wrap}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 32 }}>{team && teams?.find((t) => t.id === team) ? `${teams.find((t) => t.id === team)?.name} 진행` : "팀 구성"}</h1>
        {teams && teams.length > 0 && <span className={`pill ${published ? "ok" : "warn"}`}>{published ? "배포됨" : "배포 전 초안"}</span>}
        <span style={{ flex: 1 }} />
        <button className="mini" type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())}>전체화면 ⛶</button>
        {team !== null && <HostLiveControls eventId={id} aid={aid} team={team} withSteps={!!team} />}
        <SfxToggle />
        <HostBack eventId={id} activityId={aid} />
      </header>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!teams && !error && <p className="sub">불러오는 중이에요…</p>}
      {teams && teams.length === 0 && <div className="panel"><h2>아직 팀이 없어요</h2><p className="sub" style={{ margin: 0 }}>관리자 화면의 활동 탭에서 팀을 구성해 주세요.</p></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
        {teams?.filter((t) => !team || t.id === team).map((t) => (
          <div key={t.id} className="panel">
            {/* 팀 이름 옆에 타임캡슐 합계(목표 봉인·팀 약속 저장) */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <h2 style={{ color: "var(--violet-t)", fontSize: 40 }}>{t.name}</h2>
              {pacts?.[t.id] && (() => { const ms = pacts[t.id].members; return <span className="sub" style={{ fontSize: 20 }}>목표 봉인 {ms.filter((m) => m.goal).length}/{ms.length} · 팀 약속 저장 {ms.filter((m) => m.pactOk).length}/{ms.length}</span>; })()}
            </div>
            {/* 명단: 타임캡슐이면 이름 옆에 목표 봉인·팀 약속 저장 표시(내용은 보이지 않는다) */}
            {/* 명단은 가로로(이름마다 한 칸). 타임캡슐이면 이름 아래 목표 봉인·약속 저장 표시 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {t.members.map((m) => {
                const st = pacts?.[t.id]?.members.find((x) => x.id === m.id);
                const mark = (ok: boolean, label: string) => (
                  <span aria-label={`${label} ${ok ? "완료" : "전"}`} style={{ color: ok ? "#7ee2a8" : "rgba(255,255,255,0.45)" }}>{label} {ok ? "✓" : "·"}</span>
                );
                return (
                  <div key={m.id} className="hostcard" style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 28, fontWeight: 700 }}>{m.name}</span>
                    {st && <span style={{ fontSize: 15, display: "flex", gap: 10 }}>{mark(st.goal, "목표")}{mark(st.pactOk, "약속")}</span>}
                  </div>
                );
              })}
            </div>
            {pacts?.[t.id] && <PactBox eventId={id} aid={aid} teamId={t.id} st={pacts[t.id]} reload={loadPacts} next={next} />}
          </div>
        ))}
      </div>
    </div>
  );
}
