// 조직도 그림(모임 전체 직책 체계). 회원 구분 › 직책 목록과 연동된다:
//   직책 하나 = 한 칸(그 직책인 회원 이름들). 직책 이름으로 자리를 정한다.
//   회장 → 부회장(왼쪽 가지) · 고문·그 밖의 직책(오른쪽 가지) → 사무총장 → 사무국(사무국장·○○국장…).
// 상자 목록 대신 선으로 이은 나무 그림이다. 소모임은 그림에 넣지 않고 아래에 따로 보여 준다(OrgClubs).
export type OrgItem = { id: string; dept: string; role: string; names: string[] };

type Level = "회장" | "부회장" | "고문" | "사무총장" | "사무국" | "기타";

export function orgLevel(dept: string): Level {
  const d = dept.replace(/\s/g, "");
  if (d.includes("부회장")) return "부회장";
  if (d.includes("고문")) return "고문";
  if (d.includes("사무총장")) return "사무총장";
  if (d.includes("사무국") || /국(장)?$/.test(d)) return "사무국";
  if (d.includes("회장")) return "회장";
  return "기타";
}

type N = { key: string; title: string; names: string[] };

// 한 칸: 위에 직책 이름, 아래에 맡은 회원(여러 명이면 줄마다)
function Node({ n, empty, tone }: { n: N; empty: string; tone?: "top" | "side" }) {
  return (
    <div className={`otn${tone ? ` ${tone}` : ""}`}>
      <b>{n.title}</b>
      {n.names.length ? n.names.map((x, i) => <span key={i}>{x}</span>) : <span className="e">{empty}</span>}
    </div>
  );
}

// 한 단: 칸이 하나면 그대로, 여럿이면 위에서 갈라지는 선으로 잇는다
function Tier({ nodes, empty, tone }: { nodes: N[]; empty: string; tone?: "top" }) {
  if (nodes.length === 1) return <div className="ott"><Node n={nodes[0]} empty={empty} tone={tone} /></div>;
  return (
    <div className="ott">
      <ul className="otb">{nodes.map((n) => <li key={n.key}><Node n={n} empty={empty} tone={tone} /></li>)}</ul>
    </div>
  );
}

export function OrgChart({ items, emptyText }: { items: OrgItem[]; emptyText: string }) {
  const nodes = (l: Level): N[] => items.filter((o) => orgLevel(o.dept) === l).map((o) => ({ key: o.id, title: o.role ? `${o.dept} ${o.role}` : o.dept, names: o.names }));
  const head = nodes("회장"), vice = nodes("부회장"), adv = nodes("고문"), sec = nodes("사무총장"), office = nodes("사무국"), etc = nodes("기타");

  const tiers: React.ReactNode[] = [];
  if (head.length) tiers.push(<Tier key="h" nodes={head} empty={emptyText} tone="top" />);
  if (vice.length || adv.length || etc.length) {
    // 가운데 줄기에서 양옆으로: 왼쪽 부회장, 오른쪽 고문(점선 — 자문)과 그 밖의 직책(감사 등, 사무국에 속하지 않는 자리)
    tiers.push(
      <div key="v" className="ots">
        <div className="l">{vice.map((n) => <Node key={n.key} n={n} empty={emptyText} />)}</div>
        <div className="trunk" aria-hidden />
        <div className="r">
          {adv.map((n) => <Node key={n.key} n={n} empty={emptyText} tone="side" />)}
          {etc.map((n) => <Node key={n.key} n={n} empty={emptyText} />)}
        </div>
      </div>,
    );
  }
  if (sec.length) tiers.push(<Tier key="s" nodes={sec} empty={emptyText} />);
  if (office.length) tiers.push(<Tier key="o" nodes={office} empty={emptyText} />);

  if (!tiers.length) return null;
  return (
    <div className="otwrap" role="group" aria-label="조직도 그림">
      <div className="ot">
        {tiers.map((t, i) => (
          <div key={i} className="otstep">
            {i > 0 && <div className="otv" aria-hidden />}
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

// 소모임: 회원 구분 › 소모임 목록 + 소모임 직책자(소모임관리) + 모임 주기(소모임관리)
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
