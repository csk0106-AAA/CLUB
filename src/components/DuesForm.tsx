"use client";

import { useId } from "react";
import { DateField } from "@/components/DateField";
import { FeeRulesFields } from "@/components/board/FormFields";
import { won } from "@/lib/client";
import { fs } from "@/lib/fs";

// 회비 설정 입력칸(원우회 회비관리·소모임 회비 공통). 모양은 lib/dues.ts 의 Dues 와 같다.
export type DuesValue = {
  period: "annual" | "monthly";
  amount: string;
  rules: { kind: string; position: string; amount: string }[];
  periodStart: string;
  periodEnd: string;
  monthDay: string;
  bank: string;
  account: string;
  holder: string;
  note: string;
};

export const PERIOD = { annual: "연회비", monthly: "월회비" } as const;
const ymd = (d: string) => d.replace(/-/g, "/");

// 입금 기한 한 줄(lib/dues.ts duesDueLabel 과 같은 규칙)
export function dueLabel(d: DuesValue): string {
  if (d.period === "monthly") return d.monthDay ? `매월 ${d.monthDay}일까지` : "";
  if (d.periodStart && d.periodEnd) return `${ymd(d.periodStart)} ~ ${ymd(d.periodEnd)}`;
  if (d.periodEnd) return `${ymd(d.periodEnd)}까지`;
  if (d.periodStart) return `${ymd(d.periodStart)}부터`;
  return "";
}

// 요약(lib/dues.ts duesSummary 와 같은 규칙)
export function duesSummary(d: DuesValue): string {
  const parts = [
    ...d.rules.filter((r) => r.amount).map((r) => `${[r.kind, r.position].filter(Boolean).join(" · ") || "전체"} ${won(r.amount)}`),
    ...(d.amount ? [`${d.rules.length ? "그 밖의 회원" : "모든 회원"} ${won(d.amount)}`] : []),
  ];
  return parts.length ? `${parts.join(" / ")} · ${PERIOD[d.period]}` : "";
}

// 저장 전에 확인할 것(문제가 없으면 "")
export function duesProblem(d: DuesValue): string {
  if (d.rules.some((r) => !r.amount)) return "조건별 금액에 금액이 빈 줄이 있어요. 금액을 넣거나 줄을 삭제해 주세요.";
  const keys = d.rules.map((r) => `${r.kind}|${r.position}`);
  if (keys.some((k, i) => keys.indexOf(k) !== i)) return "같은 조건의 줄이 두 번 있어요. 하나를 삭제해 주세요.";
  if (d.period === "annual" && d.periodStart && d.periodEnd && d.periodStart > d.periodEnd) return "입금 기간의 끝 날짜가 시작 날짜보다 빨라요.";
  return "";
}

const sect = { display: "flex", flexDirection: "column", gap: 12 } as const;
const head = { font: `700 ${fs(17)} var(--display)` } as const;

export function DuesForm({ value: d, onChange, kinds, positions, unit = "회비" }: {
  value: DuesValue;
  onChange: (d: DuesValue) => void;
  kinds: string[];
  positions: string[];
  unit?: string;
}) {
  const id = useId();
  const set = <K extends keyof DuesValue>(k: K, v: DuesValue[K]) => onChange({ ...d, [k]: v });
  return (
    <>
      <section className="card" aria-labelledby={`${id}-h1`} style={sect}>
        <b id={`${id}-h1`} style={head}>{unit} 종류와 금액</b>
        <div className="checks" role="radiogroup" aria-label={`${unit} 종류`}>
          {(["annual", "monthly"] as const).map((p) => (
            <label key={p}><input type="radio" name={`${id}-period`} checked={d.period === p} onChange={() => set("period", p)} />{PERIOD[p]}</label>
          ))}
        </div>
        <FeeRulesFields amount={d.amount} rules={d.rules} kinds={kinds} positions={positions} unit={unit}
          onChange={(amount, rules) => onChange({ ...d, amount, rules })} />
      </section>

      <section className="card" aria-labelledby={`${id}-h2`} style={sect}>
        <b id={`${id}-h2`} style={head}>입금 기한</b>
        {d.period === "annual" ? (
          <>
            <span className="small">연회비를 받는 기간이에요. 끝 날짜의 해가 지나면 관리자에게 “새해 연회비를 정해 주세요” 알림이 떠요.</span>
            <div className="grid2">
              <div><label className="l" htmlFor={`${id}-ps`}>입금 기간 시작</label><DateField id={`${id}-ps`} mode="date" value={d.periodStart} onChange={(v) => set("periodStart", v)} /></div>
              <div><label className="l" htmlFor={`${id}-pe`}>입금 기간 끝</label><DateField id={`${id}-pe`} mode="date" value={d.periodEnd} onChange={(v) => set("periodEnd", v)} /></div>
            </div>
          </>
        ) : (
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <label className="l" htmlFor={`${id}-md`} style={{ margin: 0 }}>매월</label>
            <select id={`${id}-md`} className="field" style={{ width: 110, minHeight: 46 }} value={d.monthDay} onChange={(e) => set("monthDay", e.target.value)}>
              <option value="">고르기</option>
              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{n}일</option>)}
            </select>
            <span>까지</span>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby={`${id}-h3`} style={sect}>
        <b id={`${id}-h3`} style={head}>입금 계좌</b>
        <div className="grid2">
          <div><label className="l" htmlFor={`${id}-bank`}>은행</label><input id={`${id}-bank`} className="field" maxLength={40} placeholder="예) 국민은행" value={d.bank} onChange={(e) => set("bank", e.target.value)} /></div>
          <div><label className="l" htmlFor={`${id}-acc`}>계좌번호</label><input id={`${id}-acc`} className="field" maxLength={80} placeholder="예) 123-456-789012" value={d.account} onChange={(e) => set("account", e.target.value)} /></div>
          <div><label className="l" htmlFor={`${id}-holder`}>예금주</label><input id={`${id}-holder`} className="field" maxLength={60} value={d.holder} onChange={(e) => set("holder", e.target.value)} /></div>
        </div>
        <div>
          <label className="l" htmlFor={`${id}-note`}>안내 메모</label>
          <textarea id={`${id}-note`} className="field" rows={3} maxLength={1000} style={{ padding: 12, lineHeight: 1.6, resize: "vertical" }}
            placeholder="예) 입금자명은 이름으로 써 주세요." value={d.note} onChange={(e) => set("note", e.target.value)} />
        </div>
      </section>
    </>
  );
}

// 미리보기 카드
export function DuesPreview({ d, extra }: { d: DuesValue; extra?: React.ReactNode }) {
  const acct = [d.bank, d.account].filter((x) => x.trim()).join(" ");
  const due = dueLabel(d);
  return (
    <div className="card" style={{ background: "var(--soft)", display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="pill gray" style={{ alignSelf: "flex-start" }}>미리보기</span>
      <b>{duesSummary(d) || "아직 회비를 정하지 않았어요."}</b>
      {due && <span className="small">입금 기한: {due}</span>}
      {acct && <span className="small">계좌: {acct}{d.holder ? ` (예금주 ${d.holder})` : ""}</span>}
      {d.note && <span className="small" style={{ whiteSpace: "pre-wrap" }}>{d.note}</span>}
      {extra}
    </div>
  );
}
