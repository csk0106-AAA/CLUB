"use client";

import { SajuOnceSwitch } from "@/components/SajuOnceSwitch";
import { ActionNote } from "@/components/ActionNote";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { CoverPicker } from "@/components/CoverPicker";
import { PasswordField } from "@/components/PasswordField";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { BASE_RULES, REQUIRED_RULES, SAJU_LABEL, SAJU_RULES } from "@/lib/ai-rules";

// 회원구분·직책·클럽 목록은 "회원 구분" 화면(/admin/kinds)으로 옮겼다.
type S = { clubName: string; clubShortName: string; clubNameDisplay: "full" | "short"; inviteCode: string; requirement: string };

function Settings() {
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<S>("/api/admin/settings");
    if (r.ok) setS(r.data);
    else setMsg({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setMsg(null);
    const r = await api("/api/admin/settings", { method: "PUT", body: s });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "저장했어요. 회원 화면에 바로 적용돼요." });
    load();
  }

  if (!s) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ActionNote msg={msg} />

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>모임 이름</b>
        <div className="grid2">
          <div><label className="l" htmlFor="s-name">모임 이름 (정식 이름)</label><input id="s-name" className="field" value={s.clubName} onChange={(e) => setS({ ...s, clubName: e.target.value })} /></div>
          <div><label className="l" htmlFor="s-short">줄여 쓰는 이름</label><input id="s-short" className="field" value={s.clubShortName} onChange={(e) => setS({ ...s, clubShortName: e.target.value })} /></div>
        </div>
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <legend className="l">회원 화면에 보일 이름 (로그인 화면·홈·설정·알림·앱 이름)</legend>
          <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
            {([["full", "정식 이름"], ["short", "줄여 쓰는 이름"]] as const).map(([v, label]) => (
              <label key={v} className="row" style={{ gap: 6, cursor: "pointer" }}>
                <input type="radio" name="s-display" value={v} checked={s.clubNameDisplay === v} onChange={() => setS({ ...s, clubNameDisplay: v })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {s.clubNameDisplay === "short" && !s.clubShortName.trim() && <span className="small">줄여 쓰는 이름이 비어 있어 정식 이름이 보여요.</span>}
        </fieldset>
        <div className="grid2">
          <div>
            <label className="l" htmlFor="s-code">공통 초대코드 (휴대폰 번호가 없는 회원용, 4자 이상)</label>
            <PasswordField id="s-code" autoComplete="off" value={s.inviteCode} onChange={(v) => setS({ ...s, inviteCode: v })} />
          </div>
        </div>
        <span className="small">회원은 명단에 등록된 휴대폰 번호 뒷자리 4자리로 로그인해요. 휴대폰 번호가 없는 회원만 이 공통 초대코드를 써요.</span>
        <div className="card" style={{ background: "var(--soft)" }}>
          <span className="pill gray">회원 첫 화면 미리보기</span>
          <div className="say" style={{ alignItems: "center", marginTop: 8 }}>
            <Mascot size={56} />
            <b style={{ font: `700 ${fs(18)}/1.3 var(--display)` }}>{(s.clubNameDisplay === "short" && s.clubShortName.trim() ? s.clubShortName : s.clubName) || "모임 이름"}</b>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: `700 ${fs(17)} var(--display)` }}>정회원 필수 조건</b>
        <div>
          <label className="l" htmlFor="s-req">필수 조건</label>
          <input id="s-req" className="field" maxLength={80} placeholder="예) 조선일보 AI 초격차 전략포럼 제6기 수료" value={s.requirement} onChange={(e) => setS({ ...s, requirement: e.target.value })} />
        </div>
        <span className="small">
          로그인 화면의 “회원 또는 참관 신청”에서 “{s.requirement.trim() || "필수 조건"}” 하셨나요?라고 물어요. “네”면 교육 이수자(회원 요청 승인 시 정회원), “아니요”면 추천인을 받아요(승인 시 준회원).
          신청은 <Link href="/admin/member-apps">회원관리 › 회원신청관리</Link>에서 승인해요.
        </span>
      </div>

      {/* 대표사진은 저장 버튼과 상관없이 고르면 바로 저장된다 */}
      <CoverPicker scope="org" title="모임 대표사진" help="일정에 회원이 올린 사진이 한 장도 없을 때 홈의 다가오는 일정·타임라인 카드에 이 사진이 보여요. 클럽 일정은 클럽 대표사진이 먼저예요. 사진을 고르면 바로 저장돼요." />

      {/* 명리학 풀이 다시 받기(테스트 중 허용 / 실제 운영은 한 번만) */}
      <SajuOnceSwitch />

      {/* AI 필수·기본 지침(코드에 정해져 있어 읽기만) */}
      <details className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <summary style={{ cursor: "pointer", font: `700 ${fs(17)} var(--display)` }}>AI 필수·기본·명리학 필수 지침</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <span className="small">앱 안의 모든 AI(활동 인터뷰·소개 글·명리학 풀이·고민 관점, 게시글 AI 작성, 오타 다듬기 등)에 적용돼요. <b>수정이 필요하면 개발자에게 요청하세요.</b></span>
          <div>
            <b style={{ fontSize: fs(14) }}>필수 지침</b> <span className="small">모든 AI에 맨 위로 들어가고, 어떤 지침보다 우선해요.</span>
            <ol className="small" style={{ margin: "4px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>{REQUIRED_RULES.map((r, i) => <li key={i}>{r}</li>)}</ol>
          </div>
          <div>
            <b style={{ fontSize: fs(14) }}>기본 지침</b> <span className="small">활동의 공통 지침이 비어 있을 때 쓰고, 활동 AI 지침 화면에 처음 채워 보여 줘요. 게시글 AI 작성에는 말투 항목(1번에서 4번)만 들어가요(임원 소개처럼 이름·직함이 필요한 글이 있어서).</span>
            <ol className="small" style={{ margin: "4px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>{BASE_RULES.map((r, i) => <li key={i}>{r}</li>)}</ol>
          </div>
          <div>
            <b style={{ fontSize: fs(14) }}>AI 명리학 필수 지침</b> <span className="small">앱 안 어디서든 명리학 사주풀이에 항상 적용돼요. 결과가 공개되는지(공개 글), 본인만 보는지(나만 보기)에 따라 붙는 지침이 달라요.</span>
            {(["common", "public", "private"] as const).map((k) => (
              <div key={k} style={{ marginTop: 6 }}>
                <span className="small" style={{ fontWeight: 700 }}>{SAJU_LABEL[k]}</span>
                <ol className="small" style={{ margin: "2px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>{SAJU_RULES[k].map((r, i) => <li key={i}>{r}</li>)}</ol>
              </div>
            ))}
          </div>
          <span className="small">그 아래로 활동마다 <b>공통 지침</b>(그 활동의 모든 세부 지침에 들어감)과 <b>세부 지침</b>(지점별)을 관리자 › 활동 템플릿 › AI 지침에서 정해요.</span>
        </div>
      </details>

      <span className="small">회원구분·직책·클럽 목록은 <Link href="/admin/kinds">회원 구분</Link> 메뉴에서 정해요.</span>

      <button className="btn" type="submit" disabled={busy} style={{ width: "auto", minWidth: 200, alignSelf: "flex-start" }}>{busy ? "저장 중…" : "저장"}</button>
    </form>
  );
}

// 프로필 북 실명 공개 시점은 '내가 누구일까요?' 활동 템플릿(활동 설정)에서 정한다(components/TemplateEditor.tsx).

export default function SettingsPage() {
  return <AdminGate mode="group" need={["group"]} active="/admin/settings"><Settings /></AdminGate>;
}
