"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminGate } from "@/components/AdminGate";
import { api, fmtWhen } from "@/lib/client";

type E = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string;
  status: string; published: string; attend: number; absent: number; paid: number; total: number;
};
const TYPES = ["전체정기모임", "워크숍", "소모임"];
const TONE: Record<string, string> = { 워크숍: "blue", 전체정기모임: "ok", 소모임: "warn" };

function Events() {
  const router = useRouter();
  const [list, setList] = useState<E[] | null>(null);
  const [filter, setFilter] = useState("전체");
  const [type, setType] = useState(TYPES[1]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ events: E[] }>("/api/admin/events");
    if (r.ok) setList(r.data.events);
    else setMsg(r.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const r = await api<{ event: { id: string } }>("/api/admin/events", { body: { type, name } });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    router.push(`/admin/events/${r.data.event.id}`);
  }

  const shown = list?.filter((e) => filter === "전체" || e.type === filter) ?? [];

  return (
    <>
      <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <div className="subnav" aria-label="행사 유형">
          {["전체", ...TYPES].map((t) => (
            <a key={t} href="#" className={filter === t ? "on" : ""} onClick={(e) => { e.preventDefault(); setFilter(t); }}>{t}</a>
          ))}
        </div>
        <a href="#new-event" className="btn" style={{ width: "auto", minWidth: 180, textDecoration: "none" }}
          onClick={(e) => { e.preventDefault(); document.getElementById("n-name")?.focus(); document.getElementById("new-event")?.scrollIntoView({ behavior: "smooth" }); }}>
          + 새 행사 만들기
        </a>
      </div>

      {msg && <div className="msg bad" role="alert">{msg}</div>}
      {!list && !msg && <p className="small">불러오는 중이에요…</p>}
      {list && shown.length === 0 && <div className="msg info">이 유형의 행사가 아직 없어요. 아래에서 만들어 보세요.</div>}

      <div className="cards">
        {shown.map((e) => (
          <Link key={e.id} href={`/admin/events/${e.id}`} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", color: "inherit", textDecoration: "none" }}>
            <span className={`pill ${TONE[e.type] ?? "gray"}`}>{e.type}</span>
            <b style={{ font: "400 21px var(--display)" }}>{e.name}</b>
            <span className="small">{fmtWhen(e.startsAt, e.endsAt, e.place)}</span>
            <div className="meter" role="progressbar" aria-label="참석 신청" aria-valuemin={0} aria-valuemax={e.total} aria-valuenow={e.attend + e.absent}>
              <i style={{ width: `${e.total ? Math.min(100, Math.round(((e.attend + e.absent) / e.total) * 100)) : 0}%` }} />
            </div>
            <span className="small">참석 신청 {e.attend} / {e.total}명{e.absent ? ` · 불참 ${e.absent}명` : ""} · 회비 입금 {e.paid}명</span>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <span className={`pill ${e.published === "true" ? "ok" : "gray"}`}>{e.published === "true" ? "회원에게 공개 중" : "회원에게 안 보임"}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ background: "var(--soft)" }}>
        <b style={{ font: "400 19px var(--display)" }}>행사를 만드는 순서</b>
        <ol className="flow">
          <li>① 유형 선택</li><li aria-hidden="true">›</li>
          <li>② 활동 템플릿에서 선택</li><li aria-hidden="true">›</li>
          <li>③ 필요하면 수정</li><li aria-hidden="true">›</li>
          <li>④ 개요를 회원에게 전달</li>
        </ol>
      </div>

      <form id="new-event" className="card" onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 20px var(--display)" }}>+ 새 행사 만들기</b>
        <div className="grid2">
          <div>
            <label className="l" htmlFor="n-type">유형</label>
            <select id="n-type" className="field" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="l" htmlFor="n-name">행사 이름</label><input id="n-name" className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <span className="small">만들면 초안으로 시작해요. 개요를 채우고 “회원에게 전달”을 눌러야 회원에게 보여요.</span>
        <button className="btn" type="submit" disabled={busy || !name.trim()} style={{ width: "auto", minWidth: 180, alignSelf: "flex-start" }}>만들기</button>
      </form>
    </>
  );
}

export default function EventsAdminPage() {
  return <AdminGate mode="events" need={["events", "fees"]} active="/admin/events"><Events /></AdminGate>;
}
