"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { OrgChart } from "@/components/OrgChart";
import { Popup } from "@/components/Popup";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

// 관리자 > 조직도. 회원은 하단 "조직도" 탭(/org)에서 본다.
// (회칙은 게시글의 회칙 글에서, 회의록은 게시글의 회의록 양식으로 옮겼다.)
type Note = { tone: "bad" | "info"; text: string } | null;
type Member = { id: string; name: string };
type Org = { id: string; dept: string; role: string; memberId: string; clubName: string; frequency: string; leaderId: string };
const BLANK = { dept: "", role: "", memberId: "", clubName: "", frequency: "", leaderId: "" };

const Msg = ({ n }: { n: Note }) => (n ? <div className={`msg ${n.tone}`} role={n.tone === "bad" ? "alert" : "status"}>{n.text}</div> : null);

function OrgEditor({ members }: { members: Member[] }) {
  const [items, setItems] = useState<Org[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [add, setAdd] = useState({ ...BLANK });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ items: Org[] }>("/api/admin/club/org");
    if (r.ok) setItems(r.data.items);
    else setNote({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setErr("");
    const r = await api("/api/admin/club/org", { body: add });
    if (!r.ok) return setErr(r.error);
    setNote({ tone: "info", text: "추가했어요." });
    setAdd({ ...BLANK });
    setOpen(false);
    load();
  }
  async function save(x: Org) {
    const { id, ...rest } = x;
    const r = await api(`/api/admin/club/org/${id}`, { method: "PATCH", body: rest });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(id: string) {
    if (!window.confirm("지울까요?")) return;
    const r = await api(`/api/admin/club/org/${id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  const upd = (id: string, patch: Partial<Org>) => setItems((l) => l && l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const sel = (v: string, on: (v: string) => void, label: string, id?: string) => (
    <select id={id} aria-label={id ? undefined : label} className="field" style={id ? undefined : { minHeight: 42 }} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">(미정)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
  return (
    <>
      <Msg n={note} />
      <span className="small">구성과 내용을 모두 고칠 수 있어요. 구분에는 회장, 부회장, 고문, 사무총장, 사무국, 소모임 같은 이름을 적고, 소모임은 소모임 이름과 리더를 함께 입력해 주세요. 회원은 하단 “조직도” 탭에서 볼 수 있어요.</span>
      {!items && <p className="small">불러오는 중이에요…</p>}
      {items && (
        <OrgChart
          emptyText="회원 선택"
          items={items.map((o) => ({ id: o.id, dept: o.dept, role: o.role, clubName: o.clubName, name: nameOf(o.memberId), leader: nameOf(o.leaderId) }))}
        />
      )}
      <div className="tblw">
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead><tr><th>구분</th><th>직책</th><th>회원</th><th>소모임 이름</th><th>모임 횟수</th><th>리더</th><th></th></tr></thead>
          <tbody>
            {items?.map((o) => (
              <tr key={o.id}>
                <td><input aria-label="구분" className="field" style={{ minHeight: 42 }} value={o.dept} onChange={(e) => upd(o.id, { dept: e.target.value })} /></td>
                <td><input aria-label="직책" className="field" style={{ minHeight: 42 }} value={o.role} onChange={(e) => upd(o.id, { role: e.target.value })} /></td>
                <td>{sel(o.memberId, (v) => upd(o.id, { memberId: v }), "회원")}</td>
                <td><input aria-label="소모임 이름" className="field" style={{ minHeight: 42 }} value={o.clubName} onChange={(e) => upd(o.id, { clubName: e.target.value })} /></td>
                <td><input aria-label="모임 횟수" className="field" style={{ minHeight: 42 }} value={o.frequency} onChange={(e) => upd(o.id, { frequency: e.target.value })} /></td>
                <td>{sel(o.leaderId, (v) => upd(o.id, { leaderId: v }), "리더")}</td>
                <td style={{ whiteSpace: "nowrap" }}><button className="mini" type="button" onClick={() => save(o)}>저장</button>{" "}<button className="mini danger" type="button" onClick={() => remove(o.id)}>삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn" type="button" aria-haspopup="dialog" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(17) }} onClick={() => { setErr(""); setOpen(true); }}>+ 항목 추가</button>
      <Popup id="org-new" width={640} title="조직도 항목 추가" open={open} onClose={() => setOpen(false)} dirty={JSON.stringify(add) !== JSON.stringify(BLANK)}>
      <form onSubmit={(e) => { e.preventDefault(); create(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div className="msg bad" role="alert">{err}</div>}
        <div className="grid2">
          <div><label className="l" htmlFor="o-dept">구분</label><input id="o-dept" className="field" value={add.dept} onChange={(e) => setAdd({ ...add, dept: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-role">직책</label><input id="o-role" className="field" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-mem">회원</label>{sel(add.memberId, (v) => setAdd({ ...add, memberId: v }), "회원", "o-mem")}</div>
          <div><label className="l" htmlFor="o-club">소모임 이름</label><input id="o-club" className="field" value={add.clubName} onChange={(e) => setAdd({ ...add, clubName: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-freq">모임 횟수</label><input id="o-freq" className="field" value={add.frequency} onChange={(e) => setAdd({ ...add, frequency: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-lead">리더</label>{sel(add.leaderId, (v) => setAdd({ ...add, leaderId: v }), "리더", "o-lead")}</div>
        </div>
        <button className="btn" type="submit" disabled={!add.dept.trim()} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: fs(17) }}>추가</button>
      </form>
      </Popup>
    </>
  );
}

function OrgAdmin() {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    api<{ members: Member[] }>("/api/admin/members").then((r) => r.ok && setMembers(r.data.members.map((m) => ({ id: m.id, name: m.name }))));
  }, []);
  return (
    <>
      <h1 className="title" style={{ fontSize: fs(24) }}>조직도</h1>
      <OrgEditor members={members} />
    </>
  );
}

export default function ClubAdminPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/club"><OrgAdmin /></AdminGate>;
}
