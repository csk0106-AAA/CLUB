"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Mascot } from "./Mascot";

export type Reading = { readingStatus: string; readingMd: string; traitsMd: string; traitsShown: boolean };

// 마크다운을 간단히 보여 준다(# 제목, - 목록, 빈 줄 문단).
export function Md({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.75 }}>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 4 }} />;
        if (/^#{1,2}\s/.test(t)) return <b key={i} style={{ font: "400 20px var(--display)", marginTop: 6 }}>{t.replace(/^#+\s*/, "")}</b>;
        if (/^#{3,}\s/.test(t)) return <b key={i} style={{ fontSize: 17, marginTop: 4 }}>{t.replace(/^#+\s*/, "")}</b>;
        if (/^[-*·]\s/.test(t)) return <div key={i} style={{ paddingLeft: 14, textIndent: -10 }}>· {t.replace(/^[-*·]\s*/, "").replace(/\*\*/g, "")}</div>;
        return <p key={i} style={{ margin: 0 }}>{t.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

// 명리학 풀이(선택). 인터뷰 마지막 단계에서 "사주 보기 / 사주 안 보기"를 고르고, 보기를 고르면 정보를 넣는다.
export function SajuPanel({ aid, r, canWrite, published = false, onChanged }: {
  aid: string; r: Reading; canWrite: boolean; published?: boolean; onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState(false);
  const [gender, setGender] = useState<"남" | "여" | "">("");
  const [calendar, setCalendar] = useState<"solar" | "lunar">("solar");
  const [leap, setLeap] = useState(false);
  const [date, setDate] = useState("");
  const [timeKnown, setTimeKnown] = useState(true);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 회원정보의 성별(있으면 확인만, 없으면 양식에서 고른다)
  const [memberGender, setMemberGender] = useState("");
  useEffect(() => {
    if (form) api<{ gender: string }>("/api/me").then((m) => m.ok && setMemberGender(m.data.gender));
  }, [form]);

  async function call(method: string, body?: unknown) {
    setBusy(true);
    setErr("");
    const res = await api(`/api/who/${aid}/reading`, { method, body });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return false;
    }
    await onChanged();
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("POST", {
      ...(memberGender ? {} : { gender }), // 회원정보에 성별이 있으면 서버가 그 값을 쓴다
      calendar, leap: calendar === "lunar" && leap, date, time: timeKnown ? time : null,
    });
    if (ok) {
      setForm(false);
      setDate("");
      setTime("");
    }
  }

  const ready = (memberGender || gender) && /^\d{4}-\d{2}-\d{2}$/.test(date) && (!timeKnown || /^\d{2}:\d{2}$/.test(time));

  const formView = (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="fb info">
        <span className="ic" aria-hidden="true">i</span>
        <div>
          <b>이렇게 쓰여요</b>
          <span className="t">
            소개 페이지 맨 끝에는 <u>명리학으로 본 성격과 성향</u>만 실려요
            {published ? "(소개가 이미 배포돼 있어서, 만든 뒤 읽어 보고 직접 “소개 페이지에 싣기”를 눌러야 공개돼요)" : "(원하지 않으면 소개 페이지에서 뺄 수 있어요)"}.
            건강·재물·직업·연애·결혼·인간관계를 담은 생애주기 전체 풀이는 나만 볼 수 있어요.
            입력한 생년월일과 태어난 시간은 풀이를 만드는 데만 쓰고 저장하지 않아요.
          </span>
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="l">성별</legend>
        {memberGender ? (
          <div className="card row" style={{ background: "var(--soft)", flexWrap: "wrap" }}>
            <b style={{ font: "400 20px var(--display)" }}>{memberGender}</b>
            <span className="small grow">회원정보에 등록된 성별이에요. 바꾸려면 설정 › 내 정보에서 고쳐 주세요.</span>
          </div>
        ) : (
          <>
            <div className="row">
              {(["남", "여"] as const).map((x) => (
                <button key={x} type="button" className="opt rowopt" aria-pressed={gender === x} onClick={() => setGender(x)}><span className="name grow">{x}</span><span className="tick" /></button>
              ))}
            </div>
            <span className="small">고른 성별은 회원정보에도 저장돼요.</span>
          </>
        )}
        <span className="small" style={{ display: "block", marginTop: 4 }}>성별은 대운(10년 단위 운의 흐름)의 방향과 결혼·자녀 해석에 쓰여요.</span>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="l">생년월일</legend>
        <div className="row" style={{ marginBottom: 8 }}>
          <button type="button" className="opt rowopt" aria-pressed={calendar === "solar"} onClick={() => setCalendar("solar")}><span className="name grow">양력</span><span className="tick" /></button>
          <button type="button" className="opt rowopt" aria-pressed={calendar === "lunar"} onClick={() => setCalendar("lunar")}><span className="name grow">음력</span><span className="tick" /></button>
        </div>
        <input className="field" type="date" aria-label="생년월일" min="1900-01-01" max="2025-12-31" value={date} onChange={(e) => setDate(e.target.value)} />
        {calendar === "lunar" && (
          <label className="row" style={{ gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={leap} onChange={(e) => setLeap(e.target.checked)} style={{ width: 22, height: 22 }} />
            <span style={{ fontWeight: 700 }}>윤달이에요</span>
          </label>
        )}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="l">태어난 시간</legend>
        <div className="row" style={{ marginBottom: 8 }}>
          <button type="button" className="opt rowopt" aria-pressed={timeKnown} onClick={() => setTimeKnown(true)}><span className="name grow">알아요</span><span className="tick" /></button>
          <button type="button" className="opt rowopt" aria-pressed={!timeKnown} onClick={() => setTimeKnown(false)}><span className="name grow">모름</span><span className="tick" /></button>
        </div>
        {timeKnown ? (
          <>
            <input className="field" type="time" aria-label="태어난 시간" value={time} onChange={(e) => setTime(e.target.value)} list="saju-hours" />
            <datalist id="saju-hours">{HOURS.map((h) => <option key={h} value={h} />)}</datalist>
          </>
        ) : (
          <span className="small">시간을 모르면 시주(태어난 시의 기둥) 없이 풀이해요.</span>
        )}
      </fieldset>
      {err && <div className="msg bad" role="alert">{err}</div>}
      {busy && <div className="msg info" role="status">명리 풀이를 만들고 있어요. 1분쯤 걸려요…</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn" type="submit" disabled={busy || !ready} style={{ width: "auto", minWidth: 180 }}>{busy ? "만드는 중…" : "풀이 만들기"}</button>
        <button className="btn white" type="button" disabled={busy} style={{ width: "auto", minWidth: 120 }} onClick={() => setForm(false)}>취소</button>
      </div>
    </form>
  );

  // 아직 고르지 않음: 사주 보기 / 사주 안 보기
  if (r.readingStatus === "" || r.readingStatus === "none") {
    return (
      <section className="card" aria-label="명리학 풀이" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="say" style={{ alignItems: "center" }}><Mascot size={48} /><b style={{ font: "400 20px var(--display)" }}>명리학으로 사주를 볼까요?</b></div>
        <span className="small">
          성별과 생년월일, 태어난 시간을 알려 주시면 명리학 관점에서 생애주기 풀이(건강, 재물, 직업, 성격, 성향, 연애, 결혼, 인간관계)를 나만 볼 수 있게 만들어 드려요.
          입력하지 않으셔도 괜찮아요. 건너뛰어도 불이익은 없어요.
        </span>
        {form ? formView : (
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" type="button" disabled={!canWrite || busy} style={{ width: "auto", minWidth: 180 }} onClick={() => setForm(true)}>명리학으로 사주 보기</button>
            <button className="btn white" type="button" disabled={!canWrite || busy} style={{ width: "auto", minWidth: 140 }} onClick={() => call("POST", { skip: true })}>사주 안 보기</button>
          </div>
        )}
        {err && !form && <div className="msg bad" role="alert">{err}</div>}
      </section>
    );
  }

  // 사주 안 보기를 골랐음: 나중에라도 볼 수 있게
  if (r.readingStatus === "skipped") {
    return (
      <section className="card" aria-label="명리학 풀이" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {form ? formView : (
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="small grow">명리학 사주는 보지 않기로 했어요.</span>
            {canWrite && <button className="mini" type="button" onClick={() => setForm(true)}>사주 보기</button>}
          </div>
        )}
      </section>
    );
  }

  // 풀이가 있음: 성격·성향(공개) + 생애주기 풀이(나만)
  // published: 소개가 이미 배포됐는지. 배포 뒤에는 "싣기"를 누르는 순간 다른 회원에게 보인다.
  const state = r.traitsShown
    ? published ? { tone: "ok", text: "소개 페이지에 공개 중" } : { tone: "ok", text: "최종 배포하면 소개 페이지 맨 끝에 실려요" }
    : { tone: "warn", text: "아직 공개되지 않았어요" };
  return (
    <section aria-label="명리학 풀이" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, borderColor: r.traitsShown ? "var(--green)" : "var(--orange-t)" }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <b className="grow" style={{ font: "400 20px var(--display)" }}>명리학으로 본 성격과 성향</b>
          <span className={`pill ${state.tone}`}>{state.text}</span>
        </div>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{r.traitsMd}</p>
        {!r.traitsShown && published && (
          <span className="small">소개가 이미 배포돼 있어서 바로 공개하지 않았어요. 읽어 보고 괜찮으면 “소개 페이지에 싣기”를 눌러 주세요. 누르면 바로 다른 회원에게 보여요.</span>
        )}
        <div className="row" style={{ flexWrap: "wrap" }}>
          {r.traitsShown ? (
            <button className="mini" type="button" disabled={busy} onClick={() => call("PATCH", { traitsShown: false })}>소개 페이지에서 빼기</button>
          ) : (
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 180, minHeight: 46, fontSize: 17 }}
              onClick={() => { if (!published || window.confirm("성격·성향 글을 소개 페이지 맨 끝에 실을까요? 바로 다른 회원에게 보여요.")) call("PATCH", { traitsShown: true }); }}>
              소개 페이지에 싣기
            </button>
          )}
        </div>
      </div>
      <details className="card">
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>나만 보는 생애주기 명리 풀이 <span className="pill gray">나만 보기</span></summary>
        <div style={{ marginTop: 10 }}><Md text={r.readingMd} /></div>
        <span className="small" style={{ display: "block", marginTop: 8 }}>이 풀이는 나만 볼 수 있어요. 프로필 북의 내 프로필에서도 볼 수 있어요.</span>
      </details>
      {form ? formView : (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {canWrite && <button className="mini" type="button" disabled={busy} onClick={() => setForm(true)}>정보 다시 넣고 새로 풀이</button>}
          <button className="mini danger" type="button" disabled={busy}
            onClick={() => { if (window.confirm("명리 풀이를 지울까요? 소개 페이지의 성격·성향 글도 함께 사라져요.")) call("DELETE"); }}>
            풀이 지우기
          </button>
        </div>
      )}
      {err && !form && <div className="msg bad" role="alert">{err}</div>}
    </section>
  );
}
