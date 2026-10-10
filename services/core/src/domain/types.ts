import type { z } from 'zod/v4';
import type * as c from '@campsite/contracts';
export type ErrorCode = z.infer<typeof c.ErrorCode>;
export type PlanName = z.infer<typeof c.Plan>;
export type RunStatus = z.infer<typeof c.RunStatus>;
export type RunTrigger = z.infer<typeof c.RunTrigger>;
export type Phase = z.infer<typeof c.Phase>;
export type FailCode = z.infer<typeof c.FailCode>;
export type Manifest = z.infer<typeof c.Manifest>;
export type SemanticState = z.infer<typeof c.SemanticState>;

export interface UserRow { id: string; google_sub: string | null; email: string; name: string; avatar_url: string | null; created_at: string }
export interface WorkspaceRow { id: string; user_id: string; runtime_id: string; r2_prefix: string; created_at: string; plan: PlanName }
export interface ChannelRow {
  id: string; workspace_id: string; title: string; brief: string; interval_min: number | null; schedule_enabled: number;
  next_run_at: string | null; last_run_at: string | null; origin_channel_id: string | null; origin_workspace_id: string | null; created_at: string;
}
export interface RunRow {
  id: string; workspace_id: string; channel_id: string; prompt: string; trigger: RunTrigger; status: RunStatus; phase: Phase; attempt: number;
  priority: number; node_id: string | null; lease_until: string | null; cancel_requested: number; fail_code: FailCode | null; vista_id: string | null;
  schedule_slot: string | null; created_at: string; updated_at: string;
}
export interface VistaRow {
  id: string; workspace_id: string; channel_id: string; latest_revision_id: string; access_version: number;
  origin_vista_id: string | null; origin_channel_id: string | null; origin_workspace_id: string | null; created_at: string;
}
export interface RevisionRow { id: string; vista_id: string; run_id: string | null; manifest_json: string; artifact_prefix: string; created_at: string }
export interface Principal { userId: string; workspaceId: string; plan: PlanName; runtimeId: string }
