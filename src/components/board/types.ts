import type { Audience } from "@/lib/audience";
import type { AvatarView } from "@/lib/avatar";
import type { FileMeta, Form, Template } from "@/lib/board";

// 게시판 화면에서 쓰는 API 응답 모양 (/api/board …)
export type BoardMe = { canWrite: boolean; manage: boolean; isAll: boolean; tplAdmin: boolean };

export type PostSummary = {
  id: string;
  form: Form;
  title: string;
  excerpt: string;
  notice: boolean;
  pinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  thumb: string;
  responded: boolean;
  closed: boolean;
  audienceText: string;
  mine: boolean;
  // 마지막으로 알림을 본 뒤: "new" 새로 올라온 글, "updated" 수정된 글(종 아이콘 숫자에 센 글과 같다)
  fresh: "" | "new" | "updated";
  // 반응 수·댓글 수
  reactions: number;
  comments: number;
};

// 반응·댓글 (/api/board/[id] 의 talk, /api/board/[id]/reactions·comments 응답)
export type PostTalk = {
  reactions: { type: string; count: number; mine: boolean; names: string[] }[];
  comments: {
    id: string; name: string; avatar: AvatarView; body: string;
    createdAt: string; edited: boolean; canEdit: boolean; canDelete: boolean;
  }[];
};

export type PostFull = {
  id: string;
  form: Form;
  title: string;
  body: string;
  data: Record<string, unknown>;
  audience: Audience;
  audienceText: string;
  notice: boolean;
  pinned: boolean;
  files: FileMeta[];
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type PostDetail = {
  post: PostFull;
  canEdit: boolean;
  // 회칙·회비 글: 고칠 수 있는 사람에게만 관리 화면 주소(없으면 "")
  manageHref: string;
  canDelete: boolean;
  seeResults: boolean;
  mine: unknown;
  results: unknown;
  rules?: { id: string; chapter: string; article: string; body: string; version: string }[];
  myFee?: { amount: string; kind: string; position: string };
  agendaLabels?: Record<string, string>;
  // 반응·댓글(회칙·회비 글은 null)
  talk: PostTalk | null;
};

export type BoardMeta = {
  templates: Record<Form, Template>;
  kinds: string[];
  positions: string[];
  agendaLabels: Record<string, string>;
  me: BoardMe & { id: string };
};

export const fileUrl = (id: string) => `/api/board/files/${encodeURIComponent(id)}`;
