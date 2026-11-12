"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";

// from: 불러올 때의 이름(새로 추가한 구분은 빈 값). 저장할 때 이름이 달라졌으면 명단에도 반영된다.
type Kind = { value: string; definition: string; from?: string };
type S = { clubName: string; clubShortName: string; inviteCode: string; memberKinds: Kind[] };

function Settings() {
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [showCode, setShowCode] = useState(false);

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([
      api<S>("/api/admin/settings"),
      api<{ members: { kind: string }[] }>("/api/admin/members"),
    ]);
    if (r.ok) setS({ ...r.data, memberKinds: r.data.memberKinds.map((k) => ({ ...k, from: k.value })) });
    else setMsg({ tone: "bad", text: r.error });
    if (m.ok) {
      const c: Record<string, number> = {};
      m.data.members.forEach((x) => { c[x.kind] = (c[x.kind] ?? 0) + 1; });
      setCounts(c);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setMsg(null);
    const r = await api<{ moved: number }>("/api/admin/settings", { method: "PUT", body: s });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: `저장했어요. 회원 화면에 바로 적용돼요.${r.data.moved ? ` 바뀐 회원구분 이름을 회원 ${r.data.moved}명의 명단에도 반영했어요.` : ""}` });
    load();
  }

  if (!s) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const setKind = (i: number, patch: Partial<Kind>) =>
    setS({ ...s, memberKinds: s.memberKinds.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 20px var(--display)" }}>원우회 이름</b>
        <div className="grid2">
          <div><label className="l" htmlFor="s-name">원우회 이름 (회원 첫 화면에 표시)</label><input id="s-name" className="field" value={s.clubName} onChange={(e) => setS({ ...s, clubName: e.target.value })} /></div>
          <div><label className="l" htmlFor="s-short">줄여 쓰는 이름</label><input id="s-short" className="field" value={s.clubShortName} onChange={(e) => setS({ ...s, clubShortName: e.target.value })} /></div>
          <div>
            <label className="l" htmlFor="s-code">공통 초대코드 (연락처가 없는 회원용, 4자 이상)</label>
            <div className="row">
              <input id="s-code" className="field" type={showCode ? "text" : "password"} autoComplete="off" value={s.inviteCode} onChange={(e) => setS({ ...s, inviteCode: e.target.value })} />
              <button className="mini" type="button" style={{ minHeight: 54 }} aria-pressed={showCode} onClick={() => setShowCode(!showCode)}>{showCode ? "숨기기" : "보기"}</button>
            </div>
          </div>
        </div>
        <span className="small">회원은 명단에 등록된 연락처 뒷자리 4자리로 로그인해요. 연락처가 없는 회원만 이 공통 초대코드를 써요.</span>
        <div className="card" style={{ background: "var(--soft)" }}>
          <span className="pill gray">회원 첫 화면 미리보기</span>
          <div className="say" style={{ alignItems: "center", marginTop: 8 }}>
            <Mascot size={56} />
            <b style={{ font: "400 21px/1.3 var(--display)" }}>{s.clubName || "원우회 이름"}</b>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 20px var(--display)" }}>회원구분 값과 정의</b>
        {s.memberKinds.map((k, i) => (
          <div key={i} className="grid2" style={{ alignItems: "end" }}>
            <div>
              <label className="l" htmlFor={`k-v-${i}`}>구분 이름 · 현재 {k.from ? counts[k.from] ?? 0 : 0}명{k.from && k.from !== k.value ? ` (저장하면 “${k.from}” → “${k.value || "…"}”)` : ""}</label>
              <input id={`k-v-${i}`} className="field" value={k.value} onChange={(e) => setKind(i, { value: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <div style={{ flex: 1 }}><label className="l" htmlFor={`k-d-${i}`}>정의</label><input id={`k-d-${i}`} className="field" value={k.definition} onChange={(e) => setKind(i, { definition: e.target.value })} /></div>
              <button className="mini danger" type="button" disabled={s.memberKinds.length <= 1} onClick={() => setS({ ...s, memberKinds: s.memberKinds.filter((_, j) => j !== i) })} style={{ minHeight: 54 }}>삭제</button>
            </div>
          </div>
        ))}
        <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start" }} onClick={() => setS({ ...s, memberKinds: [...s.memberKinds, { value: "", definition: "" }] })}>+ 회원구분 추가</button>
        <span className="small">구분 이름을 바꾸고 저장하면 그 구분으로 지정된 회원 명단과 화면 전체에 바로 적용돼요. 구분을 삭제해도 회원의 값은 남으니, 삭제 전에 회원 명단에서 다른 구분으로 옮겨 주세요.</span>
      </div>

      <button className="btn" type="submit" disabled={busy} style={{ width: "auto", minWidth: 200, alignSelf: "flex-start" }}>{busy ? "저장 중…" : "저장"}</button>
      <ProfileReveal />
    </form>
  );
}

// 프로필 북 실명 공개 시점. 이 시각 전에는 별칭으로만 보인다.
function ProfileReveal() {
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  useEffect(() => {
    api<{ revealAt: string }>("/api/admin/profile-settings").then((r) => r.ok && setAt(r.data.revealAt));
  }, []);
  async function save() {
    const r = await api("/api/admin/profile-settings", { method: "PUT", body: { revealAt: at } });
    setMsg(r.ok ? { tone: "info", text: at ? "실명 공개 시점을 저장했어요." : "공개 시점을 지웠어요. 별칭으로만 보여요." } : { tone: "bad", text: r.error });
  }
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: "400 20px var(--display)" }}>프로필 북 실명 공개 시점</b>
      <span className="small">행사가 끝난 뒤 별칭 대신 실명으로 보여 줄 시점이에요(한국 시간). 비워 두면 계속 별칭으로만 보여요.</span>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <input aria-label="실명 공개 시점" className="field" type="datetime-local" style={{ maxWidth: 280 }} value={at} onChange={(e) => setAt(e.target.value)} />
        <button className="mini" type="button" style={{ minHeight: 54 }} onClick={save}>저장</button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/settings"><Settings /></AdminGate>;
}
