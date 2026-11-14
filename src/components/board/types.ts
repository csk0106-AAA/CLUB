import type { Audience } from "@/lib/audience";
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
  seeResults: boolean;
  mine: unknown;
  results: unknown;
  rules?: { id: string; chapter: string; article: string; body: string; version: string }[];
  myFee?: { amount: string; kind: string; position: string };
  agendaLabels?: Record<string, string>;
};

export type BoardMeta = {
  templates: Record<Form, Template>;
  kinds: string[];
  positions: string[];
  agendaLabels: Record<string, string>;
  me: BoardMe & { id: string };
};

export const fileUrl = (id: string) => `/api/board/files/${encodeURIComponent(id)}`;
