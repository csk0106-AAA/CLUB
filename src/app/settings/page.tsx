"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { MemberTabs } from "@/components/MemberTabs";
import { applyScale, applyTheme, readScale, SCALES } from "@/components/ThemeBoot";
import { api } from "@/lib/client";
import { mergePrefs, type Prefs, type PrefsInput } from "@/lib/prefs";
import { disablePush, enablePush, pushSupported } from "@/lib/push-client";

type Me = {
  name: string; perms: string[]; admin: boolean; consent: boolean; gender: string;
  company: string; title: string; phone: string;
  clubs: { name: string; role: string }[]; clubOptions: string[];
  prefs: Prefs;
};

const THEME_OPTS: { v: Prefs["theme"]; label: string; sub: string }[] = [
  { v: "system", label: "시스템", sub: "휴대폰 설정을 따라요" },
  { v: "light", label: "기본", sub: "밝은 화면" },
  { v: "dark", label: "다크", sub: "어두운 화면" },
];
const NOTIFY_OPTS: { k: keyof Prefs["notify"]; label: string }[] = [
  { k: "events", label: "행사" },
  { k: "posts", label: "공지글" },
  { k: "profiles", label: "프로필북 수정" },
];
const ROLE_MSG = "소모임 직책이 있는 소모임은 관리자에게 변경을 요청해 주세요.";

const digits = (s: string) => s.replace(/\D/g, "");
const sectionTitle = { font: "400 19px var(--display)" } as const;
const col = { display: "flex", flexDirection: "column", gap: 8 } as const;

// 켜기·끄기 스위치 한 줄
function Switch({ id, label, sub, on, disabled, onChange }: { id: string; label: string; sub?: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switchrow">
      <span className="grow">
        <b id={`${id}-l`}>{label}</b>
        {sub && <span className="small" style={{ display: "block" }} id={`${id}-d`}>{sub}</span>}
      </span>
      <button
        type="button" role="switch" className="switch" aria-checked={on} aria-labelledby={`${id}-l`}
        aria-describedby={sub ? `${id}-d` : undefined} disabled={disabled} onClick={() => onChange(!on)}
      />
    </div>
  );
}

// 회원 설정 탭: 내 정보, 화면 모드, 받을 알림, 알림 설정, 로그아웃. 관리자 화면은 하단 "관리자" 탭에 있다.
export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [club, setClub] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // 내 정보 입력칸(저장 버튼으로 한 번에 저장)
  const [form, setForm] = useState({ company: "", title: "", phone: "" });
  // 글자 크기: 이 기기에만 저장(서버 저장 없음)
  const [scale, setScale] = useState("1");
  useEffect(() => setScale(readScale()), []);
  function pickScale(v: string) {
    setScale(v);
    applyScale(v);
  }

  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      if (r.ok) {
        setMe(r.data);
        setForm({ company: r.data.company, title: r.data.title, phone: r.data.phone });
        applyTheme(r.data.prefs.theme);
      } else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
    api<{ clubName: string }>("/api/public/club").then((c) => c.ok && setClub(c.data.clubName));
  }, [router]);

  async function patch(body: Record<string, unknown>, okText?: string): Promise<Me | null> {
    setSaving(true);
    const r = await api<Me>("/api/me", { method: "PATCH", body });
    setSaving(false);
    if (!r.ok) {
      setNote({ tone: "bad", text: r.error });
      return null;
    }
    setMe(r.data);
    setNote(okText ? { tone: "ok", text: okText } : null);
    return r.data;
  }

  async function saveGender(gender: "남" | "여") {
    if (!me || me.gender === gender) return;
    await patch({ gender }, "성별을 저장했어요.");
  }

  // 회사명·직책·휴대폰 번호
  const phoneDigits = digits(form.phone);
  const phoneChanged = me != null && phoneDigits !== digits(me.phone);
  const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 11;
  const infoChanged = me != null && (form.company.trim() !== me.company || form.title.trim() !== me.title || phoneChanged);
  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !infoChanged) return;
    if (phoneChanged && !phoneOk) return setNote({ tone: "bad", text: "휴대폰 번호는 숫자 10~11자리로 적어 주세요." });
    if (phoneChanged && !window.confirm(`다음 로그인부터 초대코드가 ${phoneDigits.slice(-4)}로 바뀌어요.\n저장할까요?`)) return;
    const body: Record<string, string> = {};
    if (form.company.trim() !== me.company) body.company = form.company.trim();
    if (form.title.trim() !== me.title) body.title = form.title.trim();
    if (phoneChanged) body.phone = form.phone;
    const d = await patch(body, phoneChanged ? `저장했어요. 다음 로그인부터 초대코드는 ${phoneDigits.slice(-4)}이에요.` : "내 정보를 저장했어요.");
    if (d) setForm({ company: d.company, title: d.title, phone: d.phone });
  }

  // 소모임: 누르면 바로 저장. 직책이 있는 소모임은 뺄 수 없다.
  async function toggleClub(name: string) {
    if (!me) return;
    const seat = me.clubs.find((c) => c.name === name);
    if (seat?.role) return setNote({ tone: "bad", text: ROLE_MSG });
    const names = seat ? me.clubs.filter((c) => c.name !== name).map((c) => c.name) : [...me.clubs.map((c) => c.name), name];
    await patch({ clubs: names }, seat ? `${name} 소모임에서 뺐어요.` : `${name} 소모임을 더했어요.`);
  }

  // 화면 모드·알림: 누르면 바로 화면에 반영하고 저장한다. 실패하면 되돌린다.
  async function savePrefs(p: PrefsInput) {
    if (!me) return;
    const before = me;
    const next = mergePrefs(me.prefs, p);
    setMe({ ...me, prefs: next });
    if (p.theme) applyTheme(p.theme);
    const d = await patch({ prefs: p });
    if (!d) {
      setMe(before);
      if (p.theme) applyTheme(before.prefs.theme);
    }
  }

  // 이 기기의 휴대폰 알림 구독 상태(알림 ON 이어도 기기마다 한 번 허용해야 한다)
  const [device, setDevice] = useState<"unknown" | "on" | "off" | "unsupported">("unknown");
  useEffect(() => {
    if (!pushSupported()) return setDevice("unsupported");
    navigator.serviceWorker.getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setDevice(sub ? "on" : "off"))
      .catch(() => setDevice("off"));
  }, []);
  async function turnOnDevice() {
    const err = await enablePush();
    setDevice(err ? device : "on");
    setNote(err ? { tone: "bad", text: err } : { tone: "ok", text: "이 기기에서 휴대폰 알림을 받아요." });
  }
  async function toggleNotify(v: boolean) {
    await savePrefs({ notifyOn: v });
    if (v) await turnOnDevice();
    else {
      await disablePush();
      setDevice(pushSupported() ? "off" : "unsupported");
    }
  }

  async function logout() {
    // 로그아웃한 기기로 다른 사람 알림이 가지 않게 이 기기 구독을 푼다.
    await disablePush();
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.push("/");
  }

  const clubNames = me ? [...me.clubOptions, ...me.clubs.map((c) => c.name).filter((n) => !me.clubOptions.includes(n))] : [];
  const pr = me?.prefs;

  return (
    <main className="app with-tabs">
      <h1 className="title">설정</h1>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!me && !error && <p className="small">불러오는 중이에요…</p>}
      {me && pr && (
        <>
          <div className="say" style={{ alignItems: "center" }}>
            <Mascot size={56} />
            <div className="grow">
              <b style={{ font: "400 20px var(--display)" }}>{me.name} 님</b>
              {club && <div className="small">{club}</div>}
            </div>
          </div>

          <div aria-live="polite" role="status">
            {note && <div className={`msg ${note.tone === "bad" ? "bad" : "info"}`}>{note.text}</div>}
          </div>

          {/* 1. 내 정보 */}
          <section className="card" aria-labelledby="s-me" style={{ ...col, gap: 12 }}>
            <b id="s-me" style={sectionTitle}>내 정보</b>

            <div style={col}>
              <span className="l" id="g-l" style={{ marginBottom: 0 }}>성별</span>
              <div className="row" role="group" aria-labelledby="g-l">
                {(["남", "여"] as const).map((x) => (
                  <button key={x} type="button" className="opt rowopt" aria-pressed={me.gender === x} disabled={saving} onClick={() => saveGender(x)}>
                    <span className="name grow">{x}</span><span className="tick" />
                  </button>
                ))}
              </div>
              <span className="small">{me.gender ? "누르면 바로 저장돼요." : "아직 성별이 없어요. 명리학 풀이를 보려면 골라 주세요."}</span>
            </div>

            <form onSubmit={saveInfo} style={{ ...col, gap: 10 }}>
              <div>
                <label className="l" htmlFor="f-co">회사명</label>
                <input id="f-co" className="field" maxLength={60} autoComplete="organization" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <label className="l" htmlFor="f-ti">직책</label>
                <input id="f-ti" className="field" maxLength={40} autoComplete="organization-title" placeholder="예: 대표" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="l" htmlFor="f-ph">핸드폰번호</label>
                <input
                  id="f-ph" className="field" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={20}
                  aria-describedby="f-ph-d" aria-invalid={phoneChanged && !phoneOk}
                  value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                <span id="f-ph-d" className="small" style={{ display: "block", marginTop: 4 }}>
                  {phoneChanged && !phoneOk
                    ? "숫자 10~11자리로 적어 주세요."
                    : phoneChanged
                      ? `저장하면 다음 로그인부터 초대코드가 ${phoneDigits.slice(-4)}로 바뀌어요.`
                      : "초대코드(로그인 번호)는 핸드폰번호 뒷자리 4자리예요."}
                </span>
              </div>
              {phoneChanged && phoneOk && (
                <div className="msg info" style={{ fontSize: 15 }}>다음 로그인부터 초대코드가 <b>{phoneDigits.slice(-4)}</b>로 바뀌어요. 잊지 않게 기억해 주세요.</div>
              )}
              <button className="btn" type="submit" style={{ minHeight: 50, fontSize: 18 }} disabled={saving || !infoChanged}>내 정보 저장</button>
            </form>

            <div style={col}>
              <span className="l" id="c-l" style={{ marginBottom: 0 }}>소모임 (여러 개 고를 수 있어요)</span>
              {clubNames.length === 0 ? (
                <span className="small">아직 등록된 소모임이 없어요. 관리자가 소모임을 만들면 고를 수 있어요.</span>
              ) : (
                <div className="pick" role="group" aria-labelledby="c-l">
                  {clubNames.map((n) => {
                    const seat = me.clubs.find((c) => c.name === n);
                    return (
                      <button key={n} type="button" className="opt rowopt" aria-pressed={Boolean(seat)} disabled={saving} onClick={() => toggleClub(n)}
                        aria-describedby={seat?.role ? "c-role" : undefined}>
                        <span className="grow" style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <span className="name">{n}</span>
                          {seat?.role && <span className="pill warn">{seat.role}</span>}
                        </span>
                        <span className="tick" />
                      </button>
                    );
                  })}
                </div>
              )}
              <span className="small" id="c-role">누르면 바로 저장돼요. 소모임 직책(예: 회장)은 관리자가 정해요. 직책이 있는 소모임은 관리자에게 변경을 요청해 주세요.</span>
            </div>
          </section>

          {/* 2. 화면 모드 */}
          <section className="card" aria-labelledby="s-theme" style={col}>
            <b id="s-theme" style={sectionTitle}>화면 모드</b>
            <div className="pick" role="group" aria-labelledby="s-theme">
              {THEME_OPTS.map((o) => (
                <button key={o.v} type="button" className="opt rowopt" aria-pressed={pr.theme === o.v} onClick={() => pr.theme !== o.v && savePrefs({ theme: o.v })}>
                  <span className="grow"><span className="name">{o.label}</span><span className="small">{o.sub}</span></span>
                  <span className="tick" />
                </button>
              ))}
            </div>
          </section>

          {/* 2-1. 글자 크기 (이 기기만) */}
          <section className="card" aria-labelledby="s-scale" style={col}>
            <b id="s-scale" style={sectionTitle}>글자 크기</b>
            <div className="quick" role="group" aria-labelledby="s-scale">
              {SCALES.map((o) => (
                <button key={o.v} type="button" className="opt" aria-pressed={scale === o.v} onClick={() => pickScale(o.v)}
                  style={{ flex: "1 1 120px", width: "auto", minHeight: 50, alignItems: "center", justifyContent: "center" }}>
                  <span className="name" style={{ fontSize: Math.round(19 * Number(o.v)) }}>{o.label}</span>
                </button>
              ))}
            </div>
            <span className="small">글자와 버튼이 함께 커지거나 작아져요. 이 기기에만 저장돼요. 폭이 좁은 휴대폰(400px 미만)에서는 화면이 넘치지 않게 “아주 크게”도 “크게”만큼만 커져요. PC 에서는 앱 화면 오른쪽 가장자리의 손잡이를 끌어 화면 너비도 바꿀 수 있어요(두 번 누르면 원래대로).</span>
          </section>

          {/* 3. 받을 알림 */}
          <section className="card" aria-labelledby="s-notify" style={col}>
            <b id="s-notify" style={sectionTitle}>받을 알림</b>
            <div className="checks" role="group" aria-labelledby="s-notify">
              {NOTIFY_OPTS.map((o) => (
                <label key={o.k}>
                  <input type="checkbox" checked={pr.notify[o.k]} onChange={(e) => savePrefs({ notify: { [o.k]: e.target.checked } })} />
                  {o.label}
                </label>
              ))}
            </div>
            <span className="small">새 글이 올라오거나 수정되면 알려 드려요. 하단 아이콘에도 숫자로 표시돼요.</span>
          </section>

          {/* 4. 알림 설정 */}
          <section className="card" aria-labelledby="s-push" style={col}>
            <b id="s-push" style={sectionTitle}>알림 설정</b>
            <Switch id="sw-on" label="알림" sub={pr.notifyOn ? "켜져 있어요" : "꺼져 있어요. 알림을 보내지 않아요."} on={pr.notifyOn} onChange={toggleNotify} />
            {pr.notifyOn && device === "off" && (
              <button type="button" className="btn white" style={{ minHeight: 46, fontSize: 16 }} onClick={turnOnDevice}>이 기기에서 휴대폰 알림 받기</button>
            )}
            {pr.notifyOn && device === "unsupported" && (
              <span className="small">이 브라우저에서는 휴대폰 알림을 받을 수 없어요. iPhone 은 공유 버튼 → “홈 화면에 추가”로 설치한 앱에서 켜 주세요. 하단 아이콘 숫자는 그대로 보여요.</span>
            )}
            <Switch id="sw-sound" label="소리" sub={pr.notifyOn ? undefined : "알림을 켜면 고를 수 있어요"} on={pr.sound} disabled={!pr.notifyOn} onChange={(v) => savePrefs({ sound: v })} />
            <Switch id="sw-quiet" label="방해 금지 시간" sub={pr.notifyOn ? "이 시간에는 알림을 보내지 않아요" : "알림을 켜면 고를 수 있어요"} on={pr.quiet.on} disabled={!pr.notifyOn} onChange={(v) => savePrefs({ quiet: { on: v } })} />
            {pr.quiet.on && (
              <div className="timerange" role="group" aria-label="방해 금지 시간">
                <input type="time" className="field" aria-label="시작 시각" value={pr.quiet.from} onChange={(e) => e.target.value && savePrefs({ quiet: { from: e.target.value } })} />
                <span aria-hidden="true">~</span>
                <input type="time" className="field" aria-label="끝 시각" value={pr.quiet.to} onChange={(e) => e.target.value && savePrefs({ quiet: { to: e.target.value } })} />
              </div>
            )}
            <span className="small">휴대폰 화면에는 내용 없이 새 게시물 수와 새 게시물 안내만 보여요.</span>
          </section>

          <div className="footer-actions">
            <button className="btn white" type="button" onClick={logout}>로그아웃</button>
          </div>
        </>
      )}
      <MemberTabs on="settings" />
    </main>
  );
}
