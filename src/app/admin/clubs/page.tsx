"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api } from "@/lib/client";
import { fs } from "@/lib/fs";

type Club = { name: string; count: number; leaders: { name: string; role: string }[]; account: string; cycle: string };

function Clubs() {
  const [list, setList] = useState<Club[] | null>(null);
  const [msg, setMsg] = useState("");
  const [admin, setAdmin] = useState(true); // false 면 소모임 직책자: 내 소모임만 보인다

  useEffect(() => {
    api<{ clubs: Club[]; admin: boolean }>("/api/admin/clubs").then((r) => {
      if (!r.ok) return setMsg(r.error);
      setList(r.data.clubs);
      setAdmin(r.data.admin);
    });
  }, []);

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        {admin
          ? <>소모임마다 회원과 회장, 입금계좌, 운영 정책을 정해요. 소모임을 더하거나 이름을 바꾸려면 <Link href="/admin/kinds">회원 구분</Link> 화면에서 해 주세요.</>
          : "내가 직책을 맡은 소모임의 회원, 입금계좌, 운영 정책, 소모임 회비를 관리해요. 소모임 직책은 관리자가 정해요."}
      </p>
      {msg && <div className="msg bad" role="alert">{msg}</div>}
      {!list && !msg && <p className="small">불러오는 중이에요…</p>}
      {list && list.length === 0 && (admin
        ? <div className="msg info">아직 소모임이 없어요. <Link href="/admin/kinds">회원 구분</Link>에서 소모임을 먼저 더해 주세요.</div>
        : <div className="msg info">직책을 맡은 소모임이 없어요.</div>)}
      <div className="cards">
        {list?.map((c) => (
          <Link key={c.name} href={`/admin/clubs/${encodeURIComponent(c.name)}`} className="card"
            style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", color: "inherit", textDecoration: "none" }}>
            <b style={{ font: `700 ${fs(18)} var(--display)` }}>{c.name}</b>
            <span className="small">회원 {c.count}명{c.cycle ? ` · ${c.cycle}` : ""}</span>
            <span className="small">{c.leaders.length ? c.leaders.map((l) => `${l.role} ${l.name}`).join(", ") : "회장을 아직 정하지 않았어요"}</span>
            <span className={`pill ${c.account ? "ok" : "gray"}`}>{c.account ? "입금계좌 있음" : "입금계좌 없음"}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function ClubsAdminPage() {
  return <AdminGate mode="clubs" need={["members"]} active="/admin/clubs"><Clubs /></AdminGate>;
}
