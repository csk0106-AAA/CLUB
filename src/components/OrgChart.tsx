// 조직도(모임 전체 직책 체계). 회원 구분 › 직책 목록 순서대로 한 줄씩: 직책 이름 + 맡은 회원.
// 소모임은 아래에 따로 보여 준다(OrgClubs).
export type OrgItem = { id: string; dept: string; role: string; names: string[] };

export function OrgList({ items, emptyText }: { items: OrgItem[]; emptyText: string }) {
  if (!items.length) return null;
  return (
    <ul className="orglist" aria-label="직책">
      {items.map((o) => (
        <li key={o.id} className="otrow">
          <b>{o.role ? `${o.dept} ${o.role}` : o.dept}</b>
          <span className="grow" style={{ color: o.names.length ? "var(--ink2)" : "var(--dis)" }}>{o.names.length ? o.names.join(", ") : emptyText}</span>
        </li>
      ))}
    </ul>
  );
}

// 소모임: 소모임관리의 소모임 목록 + 소모임 직책자(소모임관리) + 모임 주기(소모임관리)
export type OrgClub = { name: string; cycle: string; leaders: { name: string; role: string }[] };

export function OrgClubs({ clubs, href }: { clubs: OrgClub[]; href?: (name: string) => string }) {
  if (!clubs.length) return <p className="small" style={{ margin: 0 }}>아직 소모임이 없어요.</p>;
  return (
    <ul className="otclubs">
      {clubs.map((c) => (
        <li key={c.name}>
          {href ? <a href={href(c.name)}><b>{c.name}</b></a> : <b>{c.name}</b>}
          <span>{c.leaders.length ? c.leaders.map((l) => `${l.role} ${l.name}`).join(" · ") : "리더 선정 예정"}</span>
          {c.cycle && <span className="cy">{c.cycle}</span>}
        </li>
      ))}
    </ul>
  );
}
