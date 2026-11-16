"use client";

import { AdminGate } from "@/components/AdminGate";
import { ClubRequestsAdmin } from "@/components/ClubRequestsAdmin";

// 관리자 › 소모임관리 › 신청내역: 모든 소모임(관리자) 또는 내가 직책을 맡은 소모임(직책자)의 가입·참관 신청.
export default function ClubRequestsPage() {
  return <AdminGate mode="clubs" need={["members"]} active="/admin/club-requests"><ClubRequestsAdmin /></AdminGate>;
}