import { redirect } from "next/navigation";

// 예전 관리자 "일정 목록": 일정 만들기·관리는 이제 일정 페이지(/events)에서 한다
// ("+ 일정 만들기", 각 일정의 "일정 관리" → /admin/events/[id]).
export default function EventsAdminPage() {
  redirect("/events");
}
