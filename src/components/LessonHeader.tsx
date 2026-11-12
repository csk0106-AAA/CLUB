import Link from "next/link";

// 활동 화면 맨 위 레슨형 헤더: 닫기(×) + 진행 막대 + n/m + 상태 표시
export function LessonHeader(props: {
  href: string;
  closeLabel: string;
  done?: number;
  total?: number;
  right?: React.ReactNode;
}) {
  const { href, closeLabel, done, total, right } = props;
  const hasProgress = typeof done === "number" && typeof total === "number" && total > 0;
  const pct = hasProgress ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="lh">
      <Link href={href} className="x" aria-label={closeLabel}>×</Link>
      {hasProgress ? (
        <div className="prog" role="progressbar" aria-label="진행" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <i style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <span className="grow" />
      )}
      {hasProgress && <span className="small num" style={{ fontWeight: 700 }}>{done}/{total}</span>}
      {right}
    </div>
  );
}
