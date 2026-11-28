"use client";

import { useId, useState } from "react";
import { ScheduleView, type SchedItem } from "./ScheduleBoard";
import { fmtDate, fmtRange, fmtWhen, TYPE_TONE, won } from "@/lib/client";
import type { FeeRule } from "@/lib/fee";

// 회비 조건 줄을 읽는 말로(lib/fee ruleLabel 과 같은 규칙. lib/fee 는 서버 코드를 끌고 와서 화면에서는 따로 둔다)
const ruleLabel = (r: FeeRule): string => {
  const parts = [r.kind, r.position, r.days ? (r.days === "1" ? "1일 참석" : `${r.days}일 참석(${Number(r.days) - 1}박${r.days}일)`) : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "전체";
};
import { fs } from "@/lib/fs";

// 일정 정보 조각: 회원 일정 화면(/events/[id])과 관리자 개요의 "회원에게 보이는 모습"이 같은 코드로 그린다.
//  - EventHeadCard: 맨 위(박스 밖 유형 라벨 · 제목 + 박스 안 일시·장소 · 클럽)
//  - Fold: "펼쳐서 보기 ▾ / 접기 ▴" 로 여닫는 칸(주요 활동, 내 참가비, 안내, 일정 …)
//  - FeeDetail / NoticeText: 참가비·안내 칸의 내용
//  - EventPreview: 관리자 미리보기(위 조각을 모두 펼친 모습)
// 대화방 안내 문구(관리자 개요)는 eventInfoLines 를 쓴다.

export type InfoEvent = {
  name: string;
  type?: string;
  startsAt: string;
  endsAt: string;
  place: string;
  booking?: string;
  feeDeadline?: string;
  account?: string;
  accountHolder?: string;
  club?: string;
  clubLeaders?: { name: string; role: string }[];
};

// 회비를 어떻게 보여 줄지
//  rules : 관리자 미리보기·대화방 문구 — 회비 줄이 "모두 전체" 한 줄뿐이면 금액과 계좌, 여러 줄이면 "앱 접속 후 내 회비 확인"
//  member: 회원 본인 — 내 회비(fee), 날짜를 골라야 정해지면 feePending. 계좌는 서버가 참석자에게만 보낸다.
export type FeeView = { kind: "rules"; rules: FeeRule[] } | { kind: "member"; fee: string; feePending?: boolean };

export type InfoLine = { icon: string; label: string; value: string; multiline?: boolean };

// 회비 줄이 "모두 전체" 한 줄뿐이면 모든 회원이 같은 금액(그 금액), 아니면 null
export const oneFee = (rules?: FeeRule[]): string | null =>
  rules && rules.length === 1 && !rules[0].days && !rules[0].kind && !rules[0].position && Number(rules[0].amount) > 0 ? rules[0].amount : null;

export const clubText = (club: string, leaders?: { name: string; role: string }[]) =>
  [club, ...(leaders ?? []).map((l) => `${l.role} ${l.name}`)].join(" · ");

const accountText = (ev: InfoEvent) => (ev.account ? `${ev.account}${ev.accountHolder ? ` (예금주 ${ev.accountHolder})` : ""}` : "");

// 참가비 줄(금액 · 입금 기한 · 계좌). 보여 줄 회비가 없으면 빈 배열.
export function feeLines(ev: InfoEvent, fee: FeeView): InfoLine[] {
  const out: InfoLine[] = [];
  const account = accountText(ev);
  if (fee.kind === "rules") {
    const one = oneFee(fee.rules);
    if (one) out.push({ icon: "💰", label: "회비", value: won(one) });
    else if (fee.rules.length) out.push({ icon: "💰", label: "회비", value: "앱 접속 후 내 회비 확인" });
    if (fee.rules.length && ev.feeDeadline) out.push({ icon: "⏰", label: "입금 기한", value: fmtDate(ev.feeDeadline) });
    if (one && account) out.push({ icon: "🏦", label: "계좌", value: account });
  } else if (fee.fee) {
    out.push({ icon: "💰", label: "금액", value: won(fee.fee) });
    if (ev.feeDeadline) out.push({ icon: "⏰", label: "입금 기한", value: fmtDate(ev.feeDeadline) });
    if (account) out.push({ icon: "🏦", label: "계좌", value: account });
  } else if (fee.feePending) {
    out.push({ icon: "💰", label: "금액", value: "참석 날짜(1일 / 1박2일 등)에 따라 달라요. 참석 날짜를 고르면 내 회비를 알려 드려요." });
  }
  return out;
}

// 대화방 안내 문구용 정보 줄(한 줄에 하나씩, 아이콘 포함)
export function eventInfoLines(ev: InfoEvent, fee: FeeView, actNames: string[]): InfoLine[] {
  const out: InfoLine[] = [];
  if (ev.club) out.push({ icon: "👥", label: "클럽", value: clubText(ev.club, ev.clubLeaders) });
  out.push({ icon: "📅", label: "일시", value: fmtRange(ev.startsAt, ev.endsAt) });
  if (ev.place) out.push({ icon: "📍", label: "장소", value: ev.place });
  if (actNames.length) out.push({ icon: "🎯", label: "주요 활동", value: actNames.join(" · ") });
  // 회비: 대화방 공지에는 조건별(참석 날짜·회원구분·직책) 금액을 모두 적고 입금 기한·계좌도 함께(앱이 어려운 회원도 공지만 보고 낼 수 있게)
  const rules = fee.kind === "rules" ? fee.rules : [];
  if (rules.length > 1) {
    out.push({ icon: "💰", label: "회비", value: rules.map((r) => `${ruleLabel(r)}: ${won(r.amount)}`).join("\n"), multiline: true });
    if (ev.feeDeadline) out.push({ icon: "⏰", label: "입금 기한", value: fmtDate(ev.feeDeadline) });
    const account = accountText(ev);
    if (account) out.push({ icon: "🏦", label: "계좌", value: account });
  } else out.push(...feeLines(ev, fee));
  if (ev.booking?.trim()) out.push({ icon: "📢", label: "안내", value: ev.booking.trim(), multiline: true });
  return out;
}

// 맨 위 카드: 유형 · 이름 · 일시·장소 · 클럽(예전 일정 홈의 모습)
export function EventHeadCard({ ev, titleAs = "h1", children }: { ev: InfoEvent; titleAs?: "h1" | "b"; children?: React.ReactNode }) {
  const Title = titleAs;
  // 유형 라벨·제목은 박스 밖 머리줄로, 일시·장소·클럽(과 children)만 박스 안에
  return (
    <section aria-label="일정 정보" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 2px" }}>
        {ev.type && <span className={`pill ${TYPE_TONE[ev.type] ?? "gray"}`} style={{ alignSelf: "flex-start" }}>{ev.type}</span>}
        <Title style={{ display: "block", margin: 0, font: `800 ${fs(24)}/1.3 var(--display)`, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>{ev.name}</Title>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="small">{fmtWhen(ev.startsAt, ev.endsAt, ev.place)}</div>
        {ev.club && <div className="small">클럽: {clubText(ev.club, ev.clubLeaders)}</div>}
        {children}
      </div>
    </section>
  );
}

// 여닫는 칸. 제목 줄 오른쪽 버튼으로 펼치고 접는다(처음엔 접힘, defaultOpen 이면 펼침).
// badge: 제목 바로 옆에 붙는 작은 표시(예: "모집 중")
export function Fold(props: { title: string; summary?: string; defaultOpen?: boolean; badge?: React.ReactNode; id?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!props.defaultOpen);
  const bodyId = useId();
  return (
    <section className="card" id={props.id} aria-label={props.title} style={{ display: "flex", flexDirection: "column", gap: 8, scrollMarginTop: 16 }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="grow" style={{ minWidth: 0 }}>
          <b style={{ font: `700 ${fs(17)} var(--display)` }}>{props.title}</b>
          {props.badge && <span style={{ marginLeft: 6, verticalAlign: "middle" }}>{props.badge}</span>}
          {props.summary && !open && <span className="small" style={{ display: "block", overflowWrap: "anywhere" }}>{props.summary}</span>}
        </span>
        <button type="button" className="mini" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}
          style={{ flex: "none", minHeight: 40 }}>
          {open ? "접기 ▴" : "펼쳐서 보기 ▾"}
          <span className="sr-only"> ({props.title})</span>
        </button>
      </div>
      <div id={bodyId} hidden={!open} style={{ display: open ? "flex" : "none", flexDirection: "column", gap: 8 }}>
        {open && props.children}
      </div>
    </section>
  );
}

// 참가비 칸 내용(한 줄에 하나씩)
export function FeeDetail({ ev, fee }: { ev: InfoEvent; fee: FeeView }) {
  return (
    <>
      {feeLines(ev, fee).map((x) => (
        <div key={x.label} className="small" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span><span aria-hidden="true">{x.icon}</span> {x.label}: {x.value}</span>
          {/* 계좌 줄: 계좌번호 복사 */}
          {x.label === "계좌" && ev.account && <CopyAccount account={ev.account} />}
        </div>
      ))}
    </>
  );
}

// 계좌번호 복사 버튼(누르면 잠깐 "복사했어요 ✓")
function CopyAccount({ account }: { account: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(account);
    } catch {
      // 복사가 막힌 브라우저: 잠깐 고를 수 있게 알려 준다
      window.prompt("아래 계좌번호를 길게 눌러 복사해 주세요.", account);
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return <button type="button" className="mini" style={{ minHeight: 28, padding: "0 8px" }} onClick={copy} aria-label={`계좌번호 ${account} 복사`}>{done ? "복사했어요 ✓" : "복사"}</button>;
}

// 안내 칸 내용(줄바꿈 그대로)
export function NoticeText({ text }: { text: string }) {
  return <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{text}</div>;
}

// 회원 화면의 칸 요약(접혀 있을 때 제목 아래 한 줄)
export const feeSummary = (ev: InfoEvent, fee: FeeView) => feeLines(ev, fee)[0]?.value ?? "";
export const noticeSummary = (text: string) => text.trim().split("\n")[0].slice(0, 40);

// 관리자 개요의 "회원에게 보이는 모습": 회원 일정 화면의 위쪽과 같은 조각을 펼친 채로 보여 준다.
export function EventPreview({ ev, rules, actNames, schedule, dayPlaces }: { ev: InfoEvent; rules: FeeRule[]; actNames: string[]; schedule: SchedItem[]; dayPlaces?: Record<string, string> }) {
  const fee: FeeView = { kind: "rules", rules };
  const hasFee = feeLines(ev, fee).length > 0;
  return (
    <div className="card" style={{ background: "var(--soft)", display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="pill gray" style={{ alignSelf: "flex-start" }}>회원에게 보이는 모습</span>
      <EventHeadCard ev={ev} titleAs="b" />
      {actNames.length > 0 && (
        <Fold title="주요 활동" summary={actNames.join(" · ")} defaultOpen>
          <div className="small">{actNames.join(" · ")}</div>
          <span className="small" style={{ color: "var(--sub)" }}>회원 화면에서는 활동 길(함께할 활동)과 진행 중인 활동 카드로 보여요.</span>
        </Fold>
      )}
      {hasFee && (
        <Fold title="내 회비" defaultOpen>
          <FeeDetail ev={ev} fee={fee} />
          {rules.length > 0 && !oneFee(rules) && <span className="small" style={{ color: "var(--sub)" }}>회원마다 회비가 달라요. 회원 화면에는 본인 금액만 보여요(참석자에게는 계좌도).</span>}
        </Fold>
      )}
      {ev.booking?.trim() && <Fold title="안내" defaultOpen><NoticeText text={ev.booking.trim()} /></Fold>}
      {schedule.length > 0 && <Fold title="일정" defaultOpen><ScheduleView items={schedule} dayPlaces={dayPlaces} /></Fold>}
      <span className="small" style={{ color: "var(--sub)" }}>회원 화면에서는 위 칸들이 접힌 채로 보이고 “펼쳐서 보기”로 열어요. 아래에 참석 신청 버튼이 있어요.</span>
    </div>
  );
}
