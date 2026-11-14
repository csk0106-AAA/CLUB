"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Team = { id: string; name: string; members: { id: string; name: string; ageGroup: string }[] };
type Data = { teams: Team[]; published: boolean };

// 일정 조편성 결과를 큰 화면(프로젝터)에 보여 준다. 읽기 전용이고 관리자만 열 수 있다.
export default function GroupsScreen({ params }: { params: Promise<{ id: string; gid: string }> }) {
  const { id, gid } = use(params);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [title, setTitle] = useState("조편성");
  const [published, setPublished] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/events/${id}/groups/${gid}/teams`);
    if (r.ok) {
      setTeams(r.data.teams);
      setPublished(r.data.published);
      setError("");
    } else if (r.status === 401 || r.status === 403) setDenied(true);
    else setError(r.error);
  }, [id, gid]);
  useEffect(() => {
    api<{ groups: { id: string; title: string }[] }>(`/api/admin/events/${id}/groups`).then((r) => {
      const g = r.ok ? r.data.groups.find((x) => x.id === gid) : undefined;
      if (g) setTitle(g.title);
    });
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id, gid, load]);

  if (denied) return <div className="host" role="alert"><h1>관리자 확인이 필요해요</h1><Link className="btn" href="/admin" style={{ width: "auto", alignSelf: "flex-start", textDecoration: "none" }}>관리자 화면으로</Link></div>;

  return (
    <div className="host" ref={wrap}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 32 }}>{title}</h1>
        {teams && teams.length > 0 && <span className={`pill ${published ? "ok" : "warn"}`}>{published ? "배포됨" : "배포 전 초안"}</span>}
        <span style={{ flex: 1 }} />
        <button className="mini" type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())}>전체화면 ⛶</button>
        <Link className="mini" href={`/admin/events/${id}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>관리자로 돌아가기</Link>
      </header>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!teams && !error && <p className="sub">불러오는 중이에요…</p>}
      {teams && teams.length === 0 && <div className="panel"><h2>아직 조가 없어요</h2><p className="sub" style={{ margin: 0 }}>관리자 화면의 조편성 탭에서 조를 만들어 주세요.</p></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
        {teams?.map((t) => (
          <div key={t.id} className="panel">
            <h2 style={{ color: "#e5c9a3", fontSize: 40 }}>{t.name} <span className="sub">{t.members.length}명</span></h2>
            {t.members.map((m) => <div key={m.id} style={{ fontSize: 30 }}>{m.name}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
