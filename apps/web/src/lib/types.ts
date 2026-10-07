/** Shared types mirroring the API schemas. */

export type ProviderKey = "instagram" | "facebook" | "youtube" | "linkedin" | "x" | "mock";
export type ContentStatus = "draft" | "scheduled" | "published" | "failed" | "archived";
export type PostStatus = "scheduled" | "publishing" | "published" | "failed" | "cancelled";
export type JobStatus = "pending" | "processing" | "success" | "failed" | "dead" | "cancelled";
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  last_login_at: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  plan: string;
  role?: WorkspaceRole;
}

export interface SocialAccount {
  id: string;
  provider: ProviderKey;
  display_name: string;
  avatar_url: string | null;
  status: "active" | "expired" | "revoked";
  is_mock: boolean;
  scopes: string[];
  last_validated_at: string | null;
  created_at: string;
}

export interface MediaItem {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
}

export interface ScheduledPost {
  id: string;
  content_id: string;
  social_account_id: string;
  provider: ProviderKey;
  account_name: string;
  scheduled_at: string;
  status: PostStatus;
  published_at: string | null;
  platform_post_url: string | null;
  error: string | null;
}

export interface ContentItem {
  id: string;
  title: string;
  caption: string;
  status: ContentStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
  media: MediaItem[];
  scheduled_posts: ScheduledPost[];
}

export interface ContentSummary {
  id: string;
  title: string;
  status: ContentStatus;
  updated_at: string;
  media: MediaItem[];
  platforms: ProviderKey[];
  next_scheduled_at: string | null;
}

export interface CalendarEvent {
  id: string;
  content_id: string;
  title: string;
  caption_preview: string;
  provider: ProviderKey;
  account_name: string;
  scheduled_at: string;
  status: PostStatus;
  platform_post_url: string | null;
  thumbnail_mime: string | null;
  thumbnail_path: string | null;
}

export interface PublishingAttempt {
  id: string;
  attempt_number: number;
  status: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface PublishingJob {
  id: string;
  scheduled_post_id: string;
  idempotency_key: string;
  status: JobStatus;
  run_at: string;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  completed_at: string | null;
  attempts: PublishingAttempt[];
}

export interface DashboardData {
  drafts: number;
  scheduled: number;
  publishing: number;
  published: number;
  failed: number;
  connected_accounts: number;
  upcoming: CalendarEvent[];
  recent_content: ContentSummary[];
}

export interface Member {
  id: string;
  role: WorkspaceRole;
  joined_at: string;
  user: User & { last_login_at: string | null };
}

export interface ProviderInfo {
  provider: ProviderKey;
  name: string;
  implemented: boolean;
  is_mock: boolean;
}
