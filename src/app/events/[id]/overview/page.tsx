import { redirect } from "next/navigation";

// 예전 "일정 개요" 주소: 이제 일정 화면(/events/[id]) 한 페이지에서 개요 정보와 참석 신청을 모두 보여 준다.
export default async function OverviewRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/events/${encodeURIComponent(id)}`);
}
