"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api, won } from "@/lib/client";
import { fs } from "@/lib/fs";

type Dues = {
  period: "annual" | "monthly"; amount: string;
  rules: { position: string; amount: string }[];
  kindRules: { kind: string; amount: string }[];
  dueText: string; bank: string; account: string; holder: string; note: string;
};
type Data = { dues: Dues; summary: string; options: { positions: string[]; kinds: string[] }; dist: { amount: string; count: number }[] };
type Note = { tone: "bad" | "info"; text: string } | null;

const PERIOD = { annual: "연회비", monthly: "월회비" } as const;
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 9);

// 화면 미리보기용 요약(서버 lib/dues.ts 의 duesSummary 와 같은 규칙)
function summary(d: Dues): string {
  const parts = [
    ...d.rules.filter((r) => r.position && r.amount).map((r) => `${r.position} ${won(r.amount)}`),
    ...d.kindRules.filter((r) => r.kind && r.amount).map((r) => `${r.kind} ${won(r.amount)}`),
    ...(d.amount ? [`${d.rules.length || d.kindRules.length ? "그 밖의 회원" : "모든 회원"} ${won(d.amount)}`] : []),
  ];
  return parts.length ? `${parts.join(" / ")} · ${PERIOD[d.period]}` : "";
}

function DuesEditor() {
  const [data, setData] = useState<Data | null>(null);
  const [d, setD] = useState<Dues | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/admin/dues");
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setData(r.data);
    setD(r.data.dues);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!d || !data) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const set = <K extends keyof Dues>(k: K, v: Dues[K]) => setD({ ...d, [k]: v });
  const usedPos = new Set(d.rules.map((r) => r.position));
  const usedKind = new Set(d.kindRules.map((r) => r.kind));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    if (d.rules.some((r) => !r.position || !r.amount)) return setNote({ tone: "bad", text: "직책별 회비에 직책이나 금액이 빈 줄이 있어요." });
    if (d.kindRules.some((r) => !r.kind || !r.amount)) return setNote({ tone: "bad", text: "회원구분별 회비에 구분이나 금액이 빈 줄이 있어요." });
    setBusy(true);
    setNote(null);
    const r = await api("/api/admin/dues", { method: "PUT", body: d });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: "모임회비 설정을 저장했어요." });
    load();
  }

  const preview = summary(d);
  const acct = [d.bank, d.account].filter((x) => x.trim()).join(" ");

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="small" style={{ margin: 0 }}>원우회 모임회비(연회비·월회비)를 정해요. 여기서 정한 입금계좌는 새 일정을 만들 때 일정 계좌로 먼저 들어가요(소모임 일정은 소모임 계좌).</p>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <section className="card" aria-label="회비 종류와 금액" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>회비 종류와 금액</b>
        <div className="checks" role="radiogroup" aria-label="회비 종류">
          {(["annual", "monthly"] as const).map((p) => (
            <label key={p}><input type="radio" name="period" checked={d.period === p} onChange={() => set("period", p)} />{PERIOD[p]}</label>
          ))}
        </div>
        <div className="grid2">
          <div>
            <label className="l" htmlFor="d-amt">기본 회비 (원)</label>
            <input id="d-amt" className="field" inputMode="numeric" placeholder="예) 30000" value={d.amount} onChange={(e) => set("amount", digits(e.target.value))} />
            <span className="hint">직책별·회원구분별 줄에 맞지 않는 회원이 내는 금액이에요.</span>
          </div>
          <div>
            <label className="l" htmlFor="d-due">납부 기한·안내</label>
            <input id="d-due" className="field" maxLength={200} placeholder={d.period === "annual" ? "예) 매년 3월 31일까지" : "예) 매월 10일까지"} value={d.dueText} onChange={(e) => set("dueText", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card" aria-label="직책별 회비" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>직책별 회비</b>
        <span className="small">직책마다 금액이 다르면 줄을 더해 주세요. “일반회원”은 직책이 없는 회원이에요.</span>
        {d.rules.map((r, i) => (
          <div key={i} className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            <select className="field" style={{ flex: "1 1 140px", width: "auto", minHeight: 46 }} aria-label={`${i + 1}번째 줄 직책`} value={r.position}
              onChange={(e) => set("rules", d.rules.map((x, j) => (j === i ? { ...x, position: e.target.value } : x)))}>
              <option value="">직책 고르기</option>
              {[...new Set([...data.options.positions, ...(r.position ? [r.position] : [])])].map((p) => (
                <option key={p} value={p} disabled={p !== r.position && usedPos.has(p)}>{p}</option>
              ))}
            </select>
            <input className="field" style={{ flex: "1 1 120px", width: "auto", minHeight: 46 }} inputMode="numeric" aria-label={`${i + 1}번째 줄 금액`} placeholder="금액(원)" value={r.amount}
              onChange={(e) => set("rules", d.rules.map((x, j) => (j === i ? { ...x, amount: digits(e.target.value) } : x)))} />
            <button className="mini danger" type="button" onClick={() => set("rules", d.rules.filter((_, j) => j !== i))}>삭제</button>
          </div>
        ))}
        <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 46, fontSize: fs(15) }}
          onClick={() => set("rules", [...d.rules, { position: data.options.positions.find((p) => !usedPos.has(p)) ?? "", amount: "" }])}>+ 직책별 회비 추가</button>
      </section>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>회원구분별 회비 (필요할 때만)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <span className="small">직책별 줄에 맞지 않는 회원에게 회원구분(정회원·명예회원 등)별 금액을 줄 수 있어요. 직책별 줄이 먼저예요.</span>
          {d.kindRules.map((r, i) => (
            <div key={i} className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <select className="field" style={{ flex: "1 1 140px", width: "auto", minHeight: 46 }} aria-label={`${i + 1}번째 줄 회원구분`} value={r.kind}
                onChange={(e) => set("kindRules", d.kindRules.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
                <option value="">회원구분 고르기</option>
                {[...new Set([...data.options.kinds, ...(r.kind ? [r.kind] : [])])].map((k) => (
                  <option key={k} value={k} disabled={k !== r.kind && usedKind.has(k)}>{k}</option>
                ))}
              </select>
              <input className="field" style={{ flex: "1 1 120px", width: "auto", minHeight: 46 }} inputMode="numeric" aria-label={`${i + 1}번째 줄 금액`} placeholder="금액(원)" value={r.amount}
                onChange={(e) => set("kindRules", d.kindRules.map((x, j) => (j === i ? { ...x, amount: digits(e.target.value) } : x)))} />
              <button className="mini danger" type="button" onClick={() => set("kindRules", d.kindRules.filter((_, j) => j !== i))}>삭제</button>
            </div>
          ))}
          <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => set("kindRules", [...d.kindRules, { kind: "", amount: "" }])}>+ 회원구분별 회비 추가</button>
        </div>
      </details>

      <section className="card" aria-label="입금계좌" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>입금계좌</b>
        <div className="grid2">
          <div><label className="l" htmlFor="d-bank">은행</label><input id="d-bank" className="field" maxLength={40} placeholder="예) 국민은행" value={d.bank} onChange={(e) => set("bank", e.target.value)} /></div>
          <div><label className="l" htmlFor="d-acc">계좌번호</label><input id="d-acc" className="field" maxLength={80} inputMode="text" placeholder="예) 123-456-789012" value={d.account} onChange={(e) => set("account", e.target.value)} /></div>
          <div><label className="l" htmlFor="d-holder">예금주</label><input id="d-holder" className="field" maxLength={60} value={d.holder} onChange={(e) => set("holder", e.target.value)} /></div>
        </div>
        <div>
          <label className="l" htmlFor="d-note">안내 메모</label>
          <textarea id="d-note" className="field" rows={3} maxLength={1000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
            placeholder="예) 입금자명은 이름으로 써 주세요." value={d.note} onChange={(e) => set("note", e.target.value)} />
        </div>
      </section>

      <div className="card" style={{ background: "var(--soft)", display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="pill gray" style={{ alignSelf: "flex-start" }}>미리보기</span>
        <b>{preview || "아직 회비를 정하지 않았어요."}</b>
        {d.dueText && <span className="small">납부: {d.dueText}</span>}
        {acct && <span className="small">계좌: {acct}{d.holder ? ` (예금주 ${d.holder})` : ""}</span>}
        {d.note && <span className="small" style={{ whiteSpace: "pre-wrap" }}>{d.note}</span>}
        {data.dist.length > 0 && data.summary && (
          <span className="small">저장된 기준 회원 수: {data.dist.map((x) => `${x.amount ? won(x.amount) : "회비 없음"} ${x.count}명`).join(" · ")}</span>
        )}
      </div>

      <button className="btn" type="submit" disabled={busy} style={{ width: "auto", minWidth: 200, alignSelf: "flex-start" }}>{busy ? "저장 중…" : "저장"}</button>
    </form>
  );
}

export default function DuesPage() {
  return <AdminGate mode="members" need={["fees", "members"]} active="/admin/dues"><DuesEditor /></AdminGate>;
}
