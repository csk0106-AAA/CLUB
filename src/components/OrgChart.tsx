// 조직도 그림: 회장 → 부회장 · 고문 → 사무총장 → 사무국 · 소모임.
// 조직도 표의 행(구분/직책/이름)을 구분 이름으로 나눠서 상자로 그린다. 이름이 없으면 emptyText 를 보여 준다.
export type OrgItem = { id: string; dept: string; role: string; name: string; clubName: string; leader: string };

type Level = "회장" | "부회장" | "고문" | "사무총장" | "사무국" | "소모임" | "기타";

function levelOf(o: OrgItem): Level {
  const d = o.dept.replace(/\s/g, "");
  if (o.clubName || d.includes("소모임")) return "소모임";
  if (d.includes("부회장")) return "부회장";
  if (d.includes("고문")) return "고문";
  if (d.includes("사무총장")) return "사무총장";
  if (d.includes("사무국") || d.endsWith("국")) return "사무국";
  if (d.includes("회장")) return "회장";
  return "기타";
}

export function OrgChart({ items, emptyText }: { items: OrgItem[]; emptyText: string }) {
  const by = (l: Level) => items.filter((o) => levelOf(o) === l);
  const people = (rows: OrgItem[]) => {
    const named = rows.map((r) => (r.name ? `${r.name}${r.role && r.role !== r.dept ? `(${r.role})` : ""}` : "")).filter(Boolean);
    return named.length ? named.join(" · ") : emptyText;
  };
  const box = (cls: string, title: string, rows: OrgItem[]) => (
    <div className={cls}>
      <b>{title}{rows.length > 1 ? ` (${rows.length})` : ""}</b>
      <span>{people(rows)}</span>
    </div>
  );

  const office = by("사무국");
  const officeText = office.length
    ? office.map((r) => {
      const unit = r.dept.replace(/\s/g, "") === "사무국" ? r.role : r.dept;
      return `${unit || "사무국"} ${r.name || emptyText}`;
    }).join(" · ")
    : emptyText;
  const clubs = by("소모임");
  const clubText = clubs.length
    ? clubs.map((c) => `${c.clubName || c.role || "소모임"}${c.leader ? `(${c.leader})` : ""}`).join(" · ")
    : "아직 없어요";
  const etc = by("기타");

  return (
    <div className="orgc" role="group" aria-label="조직도 그림">
      {box("on1", "회장", by("회장"))}
      <div className="orow">{box("on2", "부회장", by("부회장"))}{box("on2", "고문", by("고문"))}</div>
      {box("on2 mid", "사무총장", by("사무총장"))}
      <div className="orow">
        <div className="on2"><b>사무국{office.length ? ` (${office.length})` : ""}</b><span>{officeText}</span></div>
        <div className="on2"><b>소모임{clubs.length ? ` (${clubs.length})` : ""}</b><span>{clubText}</span></div>
      </div>
      {etc.length > 0 && <div className="on2"><b>그 밖의 직책 ({etc.length})</b><span>{etc.map((r) => `${r.dept}${r.role ? ` ${r.role}` : ""} ${r.name || emptyText}`).join(" · ")}</span></div>}
    </div>
  );
}
