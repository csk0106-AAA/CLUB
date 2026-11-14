"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { api, fmtRange } from "@/lib/client";

type Item = {
  eventId: string; eventName: string; id: string; name: string; startsAt: string; endsAt: string;
  screen: string; steps: { key: string; label: string }[];
  live: { active: boolean; stepKey: string; stepLabel: string; unlocked: boolean };
};
type Data = { mode: "host" | "admin" | "member"; name: string; items: Item[] };

// 사회자 첫 화면: 사회자 접속번호로 로그인한 회원은 여기와 활동 진행 화면만 쓴다.
export default function HostHome() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/host");
    if (r.ok) setD(r.data);
    else if (r.status === 401) router.replace("/");
    else setMsg({ tone: "bad", text: r.error });
  }, [router]);
  useEffect(() => {
    load();
  }, [load]);

  async function step(it: Item, body: { action: "activate"; step: string } | { action: "lock" }) {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/admin/events/${it.eventId}/activities/${it.id}/live`, { body });
    setBusy(false);
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    await load();
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.push("/");
  }

  if (!d) return <main className="app">{msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>}</main>;

  if (d.mode !== "host") {
    return (
      <main className="app">
        <h1 className="title">사회자 화면</h1>
        <div className="msg info">사회자 접속번호로 로그인하면 내가 진행할 활동이 여기에 보여요.{d.mode === "admin" ? " 관리자는 일정 › 활동에서 사회자 전체화면을 열 수 있어요." : ""}</div>
        <div className="footer-actions">
          <button className="btn white" type="button" onClick={() => router.push("/events")}>돌아가기</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="say" style={{ alignItems: "center" }}>
        <Mascot size={56} />
        <div className="grow">
          <b style={{ font: "700 20px var(--display)" }}>{d.name} 님, 사회자로 들어왔어요</b>
          <div className="small">진행할 활동만 보여요. 회원으로 참여하려면 로그아웃하고 평소 초대코드로 다시 들어오세요.</div>
        </div>
      </div>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {d.items.length === 0 && <div className="msg info">지금 진행할 활동이 없어요. 관리자에게 사회자 지정을 확인해 주세요.</div>}

      {d.items.map((it) => (
        <section key={it.id} className="card" aria-label={it.name} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="small">{it.eventName}</span>
          <b style={{ font: "700 22px var(--display)" }}>{it.name}</b>
          {it.startsAt && <span className="small">{fmtRange(it.startsAt, it.endsAt)}</span>}
          <span className={`pill ${it.live.active ? (it.live.unlocked ? "ok" : "warn") : "gray"}`} style={{ alignSelf: "flex-start" }}>
            {it.live.active ? `${it.live.stepLabel} · ${it.live.unlocked ? "회원 화면 열림" : "회원 화면 잠김"}` : "시작 전"}
          </span>
          {it.screen && (
            <Link href={it.screen} className="btn blue" style={{ textDecoration: "none", minHeight: 54, fontSize: 19 }}>
              진행 화면 열기 ⛶
            </Link>
          )}
          {it.steps.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="l" style={{ marginBottom: 0 }}>단계 진행</span>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {it.steps.map((s) => (
                  <button key={s.key} type="button" disabled={busy}
                    className={`btn ${it.live.stepKey === s.key && it.live.unlocked ? "blue" : "white"}`}
                    style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: 17 }}
                    onClick={() => step(it, { action: "activate", step: s.key })}>
                    {s.label}
                  </button>
                ))}
                {it.live.unlocked && (
                  <button type="button" className="btn red" disabled={busy} style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: 17 }} onClick={() => step(it, { action: "lock" })}>
                    회원 화면 잠그기
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      ))}

      <div className="footer-actions">
        <button className="btn white" type="button" onClick={logout}>로그아웃</button>
      </div>
    </main>
  );
}
