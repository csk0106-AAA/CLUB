// 목록의 NEW / UP 표시(게시글·일정·프로필 북·알림 창 공통).
//  new     : 마지막으로 본 뒤 새로 올라온 것 → "NEW"(보라)
//  updated : 예전에 올라온 것이 그 뒤 바뀐 것 → "UP"(회색)
// 기준은 서버(lib/unread.ts)가 정하고, 하단 탭·종 아이콘 숫자와 같다. 내가 올린 것에는 오지 않는다.
// 화면 읽기 프로그램에는 "새 글" / "업데이트된 글"로 읽힌다.
export type Fresh = "new" | "updated";

export function FreshChip({ fresh, style }: { fresh?: Fresh | "" | null; style?: React.CSSProperties }) {
  if (fresh !== "new" && fresh !== "updated") return null;
  const isNew = fresh === "new";
  return (
    <span className={`chip ${isNew ? "violet" : "gray"}`} style={{ letterSpacing: 0.3, ...style }}>
      <span aria-hidden="true">{isNew ? "NEW" : "UP"}</span>
      <span className="sr-only">{isNew ? "새 글" : "업데이트된 글"}</span>
    </span>
  );
}
