"use client";

import { useState } from "react";
import { Popup } from "./Popup";
import { fs } from "@/lib/fs";
import { typePhone } from "@/lib/phone";

type Step = "ask" | "form" | "done";
type Type = "member" | "observe";

// 로그인 화면 "회원 또는 참관 신청"(명단에 이름이 없는 분). lib/member-apps.ts 절차 참고.
//  1) 정회원 필수 조건(모임개요)을 갖췄는지 묻고(네/아니요)
//  2) 이름(실명)·전화번호(+ 아니요면 추천인 1명 이상)를 받아 "회원요청" 또는 "참관요청"
//  3) 바로 명단에 "승인 전"으로 등록되고, 이름 + 전화번호 뒷자리 4자리로 로그인할 수 있다.
export function SignupSheet({ open, onClose, requirement, onDone }: {
  open: boolean;
  onClose: () => void;
  requirement: string;
  onDone: (name: string) => void; // 등록된 이름(동명이인이면 알파벳이 붙은 이름)
}) {
  const req = requirement.trim() || "교육과정 수료";
  const [step, setStep] = useState<Step>("ask");
  const [edu, setEdu] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [recs, setRecs] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // rejoin: 탈퇴한 회원의 재가입 신청(관리자가 확인한 뒤에 로그인할 수 있다)
  const [result, setResult] = useState<{ name: string; renamed: boolean; type: Type; rejoin?: boolean } | null>(null);

  function close() {
    onClose();
    // 다음에 열 때 처음부터
    setTimeout(() => {
      setStep("ask"); setEdu(null); setName(""); setPhone(""); setRecs(""); setMessage(""); setError(""); setResult(null);
    }, 200);
  }

  async function send(type: Type) {
    setError("");
    if (!name.trim()) return setError("이름(실명)을 적어 주세요.");
    if (phone.replace(/\D/g, "").length < 10) return setError("휴대폰 번호를 숫자 10자리나 11자리로 적어 주세요.");
    if (!edu && !recs.trim()) return setError("추천인을 1명 이상 적어 주세요.");
    setBusy(true);
    try {
      const r = await fetch("/api/public/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edu: !!edu, type, name, phone, recommenders: edu ? "" : recs, message }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "신청하지 못했어요. 잠시 후 다시 해 주세요.");
      setResult({ name: d.name, renamed: !!d.renamed, type, rejoin: !!d.rejoin });
      setStep("done");
    } catch {
      setError("연결이 불안정해요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const dirty = step === "form" && !!(name || phone || recs || message);
  const footer = step === "form" ? (
    <div className="row" style={{ gap: 8, width: "100%" }}>
      <button className="btn" type="button" disabled={busy} style={{ flex: 1 }} onClick={() => send("member")}>{busy ? "보내는 중…" : "회원요청"}</button>
      <button className="btn white" type="button" disabled={busy} style={{ flex: 1 }} onClick={() => send("observe")}>참관요청</button>
    </div>
  ) : step === "done" && result ? (
    result.rejoin
      ? <button className="btn" type="button" onClick={close}>닫기</button>
      : <button className="btn" type="button" onClick={() => { onDone(result.name); close(); }}>로그인하러 가기</button>
  ) : null;

  return (
    <Popup id="signup" width={480} title="회원 또는 참관 신청" open={open} onClose={close} dirty={dirty} footer={footer}>
      {step === "ask" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, font: `700 ${fs(18)}/1.45 var(--display)` }}>“{req}” 하셨나요?</p>
          <span className="small">답에 따라 신청 내용이 달라져요. 관리자가 확인한 뒤 회원구분이 정해져요.</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" type="button" onClick={() => { setEdu(true); setStep("form"); }}>네</button>
            <button className="btn white" type="button" onClick={() => { setEdu(false); setStep("form"); }}>아니요</button>
          </div>
        </div>
      )}

      {step === "form" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="pill gray">{req}: {edu ? "네" : "아니요"}</span>
            <button className="mini" type="button" onClick={() => { setStep("ask"); setError(""); }}>다시 고르기</button>
          </div>
          <div>
            <label className="l" htmlFor="su-name">이름 (실명)</label>
            <input id="su-name" className="field" autoComplete="name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="l" htmlFor="su-phone">휴대폰 번호</label>
            <input id="su-phone" className="field" inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" maxLength={20} value={phone} onChange={(e) => setPhone(typePhone(e.target.value))} />
            <span className="hint" style={{ fontSize: fs(12) }}>휴대폰 번호 뒷자리 4자리가 초대코드(로그인 번호)가 돼요.</span>
          </div>
          {!edu && (
            <div>
              <label className="l" htmlFor="su-recs">추천인 (1명 이상, 여러 명은 쉼표로)</label>
              <input id="su-recs" className="field" maxLength={200} placeholder="예) 홍길동, 김철수" value={recs} onChange={(e) => setRecs(e.target.value)} />
            </div>
          )}
          <div>
            <label className="l" htmlFor="su-msg">남길 말 (선택)</label>
            <textarea id="su-msg" className="field" rows={2} maxLength={300} style={{ padding: 12, lineHeight: 1.5, resize: "vertical" }} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="msg info" style={{ fontSize: fs(13), lineHeight: 1.5 }}>
            <b>회원요청</b>: 관리자가 승인하면 {edu ? "정회원" : "준회원"}이 돼요.<br />
            <b>참관요청</b>: 관리자가 승인하면 {edu ? "대기회원" : "참관회원"}으로 일정에 참관 신청을 할 수 있어요.<br />
            신청하면 바로 로그인할 수 있고, 승인 전에는 “승인 전”으로 표시돼요.
          </div>
          {error && <div className="msg bad" role="alert">{error}</div>}
        </div>
      )}

      {step === "done" && result?.rejoin && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} role="status">
          <p style={{ margin: 0, font: `700 ${fs(18)}/1.45 var(--display)` }}>재가입 신청을 보냈어요 ✓</p>
          <span>예전에 탈퇴한 기록이 있어요. 관리자가 확인하고 탈퇴를 해지하면 “{result.name}” 이름으로 다시 로그인할 수 있어요(초대코드: 휴대폰 번호 뒷자리 4자리).</span>
        </div>
      )}
      {step === "done" && result && !result.rejoin && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} role="status">
          <p style={{ margin: 0, font: `700 ${fs(18)}/1.45 var(--display)` }}>{result.type === "member" ? "회원요청" : "참관요청"}을 보냈어요 ✓</p>
          <span>관리자가 확인하면 알려 드려요. 지금도 로그인할 수 있어요.</span>
          <div className="card" style={{ background: "var(--soft)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span>로그인 이름: <b>{result.name}</b></span>
            <span>초대코드: <b>휴대폰 번호 뒷자리 4자리</b></span>
          </div>
          {result.renamed && <span className="small">같은 이름의 회원이 있어서 이름 뒤에 알파벳을 붙였어요. 로그인할 때 “{result.name}”을(를) 골라 주세요.</span>}
        </div>
      )}
    </Popup>
  );
}
