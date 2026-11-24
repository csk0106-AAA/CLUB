"use client";

import { HostBack, HostDenied } from "@/components/HostBack";
import { HostLiveControls } from "@/components/HostLiveControls";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useTeamParam } from "@/components/TeamScope";

type Team = { id: string; name: string; members: { id: string; name: string; ageGroup: string }[] };
type Data = { teams: Team[]; published: boolean };

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
        <HostBack eventId={id} activityId={aid} />
      </header>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!teams && !error && <p className="sub">불러오는 중이에요…</p>}
      {teams && teams.length === 0 && <div className="panel"><h2>아직 팀이 없어요</h2><p className="sub" style={{ margin: 0 }}>관리자 화면의 활동 탭에서 팀을 구성해 주세요.</p></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
        {teams?.filter((t) => !team || t.id === team).map((t) => (
          <div key={t.id} className="panel">
            <h2 style={{ color: "var(--violet-t)", fontSize: 40 }}>{t.name}</h2>
            {t.members.map((m) => <div key={m.id} style={{ fontSize: 30 }}>{m.name}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
