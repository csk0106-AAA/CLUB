"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";
import { ActionNote, type ActionMsg } from "./ActionNote";
import { PasswordField } from "./PasswordField";

// 설정 › 로그인 PIN 바꾸기: 지금 PIN 을 확인하고 새 PIN(6자리, 두 번)으로
export function PinChange() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ActionMsg>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pin !== pin2) return setMsg({ tone: "bad", text: "새 PIN 두 번이 서로 달라요." });
    setBusy(true);
    setMsg(null);
    const r = await api("/api/auth/pin-change", { body: { current: cur, pin } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setCur(""); setPin(""); setPin2(""); setOpen(false);
    setMsg({ tone: "info", text: "로그인 PIN 을 바꿨어요. 다음 로그인부터 새 PIN 을 써요." });
  }
  return (
    <section className="sect" aria-labelledby="s-pin">
      <h2 id="s-pin">로그인 PIN</h2>
      <div className="sect-body" style={{ gap: 10 }}>
        <span className="small">로그인할 때 쓰는 6자리 PIN 이에요. 잊었다면 로그인 화면의 “PIN을 잊었어요”로 관리자에게 초기화를 요청할 수 있어요.</span>
        {!open ? (
          <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>PIN 바꾸기</button>
        ) : (
          <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div><label className="l" htmlFor="pin-cur">지금 PIN</label><PasswordField id="pin-cur" inputMode="numeric" autoComplete="current-password" value={cur} onChange={setCur} /></div>
            <div><label className="l" htmlFor="pin-new">새 PIN (숫자 6자리)</label><PasswordField id="pin-new" inputMode="numeric" autoComplete="new-password" value={pin} onChange={setPin} /></div>
            <div><label className="l" htmlFor="pin-new2">새 PIN 한 번 더</label><PasswordField id="pin-new2" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={setPin2} /></div>
            <span className="small" style={{ fontSize: fs(12) }}>같은 숫자 반복, 123456 같은 연속 숫자, 휴대폰 번호 뒷자리 4자리가 들어간 번호, 관리자용 PIN 과 같은 번호는 쓸 수 없어요.</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" type="submit" disabled={busy || !cur || pin.length !== 6 || pin2.length !== 6} style={{ flex: "1 1 0" }}>{busy ? "바꾸는 중…" : "바꾸기"}</button>
              <button className="btn white" type="button" disabled={busy} style={{ flex: "1 1 0" }} onClick={() => { setOpen(false); setMsg(null); }}>취소</button>
            </div>
          </form>
        )}
        <ActionNote msg={msg} />
      </div>
    </section>
  );
}
