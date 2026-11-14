"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { MemberTabs } from "@/components/MemberTabs";
import { Sheet } from "@/components/Sheet";
import { api, fmtWhen, TYPE_TONE } from "@/lib/client";

type Ev = {
  id: string;
  type: string;
  name: string;
  startsAt: string;
  endsAt: string;
  place: string;
  status: string;
  myAnswer: string;
  feeDue: boolean;
  feePaid: boolean;
  payNotice: boolean;
  club?: string;
};
type Me = { name: string; perms: string[]; admin: boolean; consent: boolean };

// ② 예정된 모임·행사 (로그인 다음 화면)
export default function EventsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [club, setClub] = useState("");
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState("");
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await api<Me>("/api/me");
      if (!m.ok) {
        if (m.status === 401) router.replace("/");
        else setError(m.error);
        return;
      }
      setMe(m.data);
      api<{ clubName: string }>("/api/public/club").then((c) => c.ok && setClub(c.data.clubName));
      const e = await api<{ events: Ev[] }>("/api/events");
      if (e.ok) setEvents(e.data.events);
      else setError("행사 목록을 불러오지 못했어요. 화면을 새로 고쳐 주세요.");
    })();
  }, [router]);

  async function agree() {
    setBusy(true);
    const r = await api("/api/me/consent", { method: "POST", body: {} });
    setBusy(false);
    if (r.ok && me) setMe({ ...me, consent: true });
    else setError(r.ok ? "" : r.error);
  }

  // 로그아웃: 로그인 화면으로 돌아가 이름과 초대코드를 다시 넣고 들어올 수 있다.
  async function logout() {
    if (!window.confirm("로그아웃할까요? 다시 들어오려면 이름과 초대코드(연락처 뒷자리 4자리)를 넣으면 돼요.")) return;
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.replace("/");
  }

  const locked = me ? !me.consent : true;

  // 참석 여부를 아직 안 알린 행사는 개요(③)부터, 알린 행사는 홈(⑥)으로 간다.
  function open(e: Ev) {
    router.push(e.myAnswer === "" ? `/events/${e.id}/overview` : `/events/${e.id}`);
  }

  return (
    <main className="app with-tabs">
      <div className="say" style={{ alignItems: "center" }}>
        <Mascot size={56} />
        <div className="grow">
          <b style={{ font: "400 20px var(--display)" }}>{me ? `${me.name} 대표님, 반갑습니다` : "반갑습니다"}</b>
          {club && <div className="small">{club}</div>}
        </div>
        {me && (
          <button className="mini" type="button" style={{ flex: "none", minHeight: 44 }} onClick={logout}>로그아웃</button>
        )}
      </div>
      <h1 className="title" style={{ fontSize: 22 }}>예정된 모임과 행사</h1>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {!events && !error && <p className="small">불러오는 중이에요…</p>}
      {events && events.length === 0 && <div className="msg info">아직 예정된 행사가 없어요.</div>}
      {declined && <div className="msg info">동의하지 않으면 활동에 참여할 수 없어요. 아래에서 다시 동의할 수 있어요.</div>}

      <div className="pick">
        {events?.map((e) => (
          <button key={e.id} className="opt" type="button" disabled={locked} onClick={() => open(e)}
            style={e.myAnswer === "" && e.startsAt ? { borderColor: "var(--blue)" } : undefined}>
            <span className={`pill ${TYPE_TONE[e.type] ?? "gray"}`}>{e.club ? `${e.type} · ${e.club}` : e.type}</span>
            <span className="name">{e.name}</span>
            <span className="small">{fmtWhen(e.startsAt, e.endsAt, e.place)}</span>
            {e.myAnswer === "" && e.startsAt && <span className="pill warn">참석 신청 필요</span>}
            {e.myAnswer === "불참" && <span className="pill gray">불참으로 알림</span>}
            {e.feeDue && (e.payNotice ? <span className="pill warn">₩ 입금 확인 중</span> : <span className="pill bad">₩ 회비 미입금</span>)}
            {e.feePaid && <span className="pill ok">회비 입금 ✓</span>}
          </button>
        ))}
      </div>
      {events && events.length > 0 && <p className="hint">행사를 누르면 그 행사에 필요한 화면으로 이동해요.</p>}

      {declined && (
        <div className="footer-actions">
          <button className="btn" type="button" onClick={() => setDeclined(false)}>동의 안내 다시 보기</button>
        </div>
      )}

      {me && !me.consent && !declined && (
        <Sheet title="개인정보 안내">
          <p style={{ margin: 0 }}>
            작성하신 내용 중 본인이 공개로 선택한 부분은 원우회 회원들에게 보여집니다. 언제든 수정·삭제할 수 있습니다.
          </p>
          <button className="btn" type="button" disabled={busy} onClick={agree}>동의합니다</button>
          <button className="btn white" type="button" onClick={() => setDeclined(true)}>동의하지 않음</button>
        </Sheet>
      )}

      <MemberTabs on="events" />
    </main>
  );
}
