"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api } from "@/lib/client";

type ListName = "memberKinds" | "positions" | "clubs" | "clubRoles";
type Data = {
  memberKinds: { value: string; definition: string }[];
  positions: string[];
  clubs: string[];
  clubRoles: string[];
  counts: Record<ListName, Record<string, number>>;
};
// from: 불러올 때의 이름(새로 추가한 값은 빈 값). 저장할 때 이름이 달라졌으면 명단에도 반영된다.
type Item = { value: string; definition?: string; from?: string; key: number };
type Note = { tone: "bad" | "info"; text: string } | null;

const INFO: Record<ListName, { title: string; one: string; help: string; deleteNote: string }> = {
  memberKinds: {
    title: "회원구분",
    one: "구분",
    help: "정회원·준회원처럼 회원을 나누는 값이에요. 이름을 바꾸면 그 구분의 회원 명단에도 바로 반영돼요.",
    deleteNote: "회원의 구분 값은 그대로 남고, 명단에 “목록에 없음”으로 보여요.",
  },
  positions: {
    title: "직책",
    one: "직책",
    help: "모임의 직책이에요. 권한설정에서 직책마다 권한을 줄 수 있어요. 이름을 바꾸면 회원 명단과 직책 권한에도 반영돼요.",
    deleteNote: "회원의 직책 값은 남지만(“목록에 없음”), 이 직책에 준 그룹 권한은 사라져요.",
  },
  clubs: {
    title: "소모임",
    one: "소모임",
    help: "골프·등산 같은 소모임 이름이에요. 이름을 바꾸면 회원들의 소모임에도 반영돼요.",
    deleteNote: "이 소모임에 들어 있는 회원들에게서 소모임이 빠져요.",
  },
  clubRoles: {
    title: "소모임 직책",
    one: "소모임 직책",
    help: "소모임의 회장·총무 같은 직책이에요. 소모임 직책자는 게시글을 쓸 수 있고, 권한설정에서 권한을 더 줄 수도 있어요.",
    deleteNote: "회원의 소모임 직책 값은 남지만, 이 직책에 준 그룹 권한은 사라져요.",
  },
};

let seq = 0;
const toItems = (d: Data, list: ListName): Item[] =>
  list === "memberKinds"
    ? d.memberKinds.map((k) => ({ value: k.value, definition: k.definition, from: k.value, key: ++seq }))
    : d[list].map((v) => ({ value: v, from: v, key: ++seq }));

function ListEditor({ list, data, onSaved }: { list: ListName; data: Data; onSaved: (text: string) => void }) {
  const info = INFO[list];
  const [items, setItems] = useState<Item[]>(() => toItems(data, list));
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setItems(toItems(data, list)), [data, list]);

  const counts = data.counts[list] ?? {};
  const original = list === "memberKinds" ? data.memberKinds.map((k) => k.value) : data[list];
  const dirty = JSON.stringify(items.map((i) => [i.value, i.definition ?? "", i.from ?? ""])) !==
    JSON.stringify(toItems(data, list).map((i) => [i.value, i.definition ?? "", i.from ?? ""]));
  const set = (key: number, patch: Partial<Item>) => setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const move = (idx: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(idx, 1);
    next.splice(idx + d, 0, x);
    setItems(next);
  };

  function remove(it: Item) {
    const n = it.from ? counts[it.from] ?? 0 : 0;
    if (n > 0 && !window.confirm(`“${it.from}”을(를) 쓰는 회원이 ${n}명 있어요. 저장하면 삭제돼요.\n${info.deleteNote}\n그래도 뺄까요?`)) return;
    setItems(items.filter((i) => i.key !== it.key));
  }

  async function save() {
    const vals = items.map((i) => i.value.trim());
    if (vals.some((v) => !v)) return setNote({ tone: "bad", text: `비어 있는 ${info.one} 이름이 있어요.` });
    const dup = vals.find((v, i) => vals.indexOf(v) !== i);
    if (dup) return setNote({ tone: "bad", text: `“${dup}”이(가) 두 번 들어 있어요.` });
    setBusy(true);
    setNote(null);
    const r = await api<{ moved: number }>("/api/admin/lists", {
      method: "PUT",
      body: { list, items: items.map((i) => ({ value: i.value.trim(), definition: i.definition, from: i.from })) },
    });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    onSaved(`${info.title} 목록을 저장했어요.${r.data.moved ? ` 회원 ${r.data.moved}명의 명단에도 반영했어요.` : ""}`);
  }

  const removed = original.filter((v) => !items.some((i) => i.from === v));

  return (
    <section className="card" aria-label={info.title} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <b style={{ font: "400 20px var(--display)" }}>{info.title} <span className="num small">{items.length}개</span></b>
      <span className="small">{info.help}</span>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {items.map((it, idx) => (
        <div key={it.key} style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: idx ? "1px solid var(--line, #eee)" : undefined, paddingTop: idx ? 8 : 0 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            <input aria-label={`${info.one} 이름`} className="field" style={{ flex: "1 1 140px", width: "auto", minHeight: 46 }} maxLength={30} value={it.value}
              placeholder={`새 ${info.one} 이름`} onChange={(e) => set(it.key, { value: e.target.value })} />
            <span className="pill gray" title="지금 이 값을 쓰는 회원 수">{it.from ? counts[it.from] ?? 0 : 0}명</span>
            <button className="mini" type="button" aria-label="위로" disabled={idx === 0} onClick={() => move(idx, -1)}>↑</button>
            <button className="mini" type="button" aria-label="아래로" disabled={idx === items.length - 1} onClick={() => move(idx, 1)}>↓</button>
            <button className="mini danger" type="button" onClick={() => remove(it)}>삭제</button>
          </div>
          {list === "memberKinds" && (
            <input aria-label="정의" className="field" style={{ minHeight: 46 }} maxLength={300} placeholder="정의 (예: 입회비를 낸 졸업 원우)" value={it.definition ?? ""}
              onChange={(e) => set(it.key, { definition: e.target.value })} />
          )}
          {it.from && it.from !== it.value.trim() && it.value.trim() && <span className="small">저장하면 “{it.from}” → “{it.value.trim()}”(으)로 바뀌어요.</span>}
        </div>
      ))}
      {items.length === 0 && <span className="small">아직 없어요. 아래에서 더해 주세요.</span>}
      {removed.length > 0 && <span className="small">저장하면 빠져요: {removed.join(", ")}</span>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="mini" type="button" onClick={() => setItems([...items, { value: "", definition: "", key: ++seq }])}>+ {info.one} 추가</button>
        <span className="grow" />
        {dirty && <button className="mini" type="button" disabled={busy} onClick={() => { setItems(toItems(data, list)); setNote(null); }}>되돌리기</button>}
        <button className="btn" type="button" style={{ width: "auto", minWidth: 110, minHeight: 44, fontSize: 16 }} disabled={busy || !dirty} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
      </div>
    </section>
  );
}

function Kinds() {
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState<Note>(null);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/admin/lists");
    if (r.ok) setData(r.data);
    else setNote({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const saved = (text: string) => { setNote({ tone: "info", text }); load(); };

  return (
    <>
      <p className="small" style={{ margin: 0 }}>여기서 정한 목록은 회원 명단에서 고를 수 있어요. 목록마다 따로 저장해요.</p>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <div className="adm-two">
        <ListEditor list="memberKinds" data={data} onSaved={saved} />
        <ListEditor list="positions" data={data} onSaved={saved} />
        <ListEditor list="clubs" data={data} onSaved={saved} />
        <ListEditor list="clubRoles" data={data} onSaved={saved} />
      </div>
    </>
  );
}

export default function KindsPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/kinds"><Kinds /></AdminGate>;
}
