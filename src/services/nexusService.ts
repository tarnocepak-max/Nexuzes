import { apiFetch, getSupabaseClient } from '../lib/supabase';
import type {
  AdminCreateUserPayload,
  ChatCategory,
  CreateInstallerPayload,
  ExecuteImportPayload,
  FinalClosePayload,
  FinalWOHistoryRecord,
  ImportBatch,
  ImportBatchRow,
  MaterialRequestItem,
  ReviewReportPayload,
  SubmitMaterialRequestPayload,
  SubmitReportPayload,
  UserProfile,
  WOAssignmentRecord,
  WOAttachment,
  WOChatMessage,
  WOIssueRecord,
  WOReportVersion,
  WOReviewRecord,
  WorkOrder,
  WorkOrderFullviewBundle,
} from '../types/nexusops';

export async function fetchWorkOrderFullviewBundle(
  workOrderId: string,
): Promise<WorkOrderFullviewBundle> {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase client is not initialized');

  const [
    woRes,
    assignRes,
    attachRes,
    chatRes,
    matRes,
    repRes,
    revRes,
    issueRes,
    histRes,
  ] = await Promise.all([
    supabase.from('work_orders').select('*').eq('id', workOrderId).single(),
    supabase
      .from('wo_assignments')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('session_segment_no', { ascending: true }),
    supabase
      .from('wo_attachments')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('wo_chat_messages')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: true }),
    supabase
      .from('material_requests')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('wo_reports')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('revision_no', { ascending: false }),
    supabase
      .from('wo_reviews')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('wo_issues')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('final_wo_history')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('sequence_no', { ascending: true }),
  ]);

  if (woRes.error || !woRes.data) {
    throw new Error(woRes.error?.message || 'Failed to load Work Order');
  }

  // Generate short-lived signed URLs for Supabase Storage objects
  const attachments = (attachRes.data ?? []) as WOAttachment[];
  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (att) => {
      const { data: signed } = await supabase.storage
        .from(att.storage_bucket)
        .createSignedUrl(att.storage_path, 3600);
      return { ...att, signed_url: signed?.signedUrl };
    }),
  );

  return {
    workOrder: woRes.data as WorkOrder,
    assignments: (assignRes.data ?? []) as WOAssignmentRecord[],
    attachments: attachmentsWithUrls,
    chatMessages: (chatRes.data ?? []) as WOChatMessage[],
    materialRequests: (matRes.data ?? []) as MaterialRequestItem[],
    reports: (repRes.data ?? []) as WOReportVersion[],
    reviews: (revRes.data ?? []) as WOReviewRecord[],
    issues: (issueRes.data ?? []) as WOIssueRecord[],
    finalHistory: (histRes.data ?? []) as FinalWOHistoryRecord[],
  };
}

/**
 * Uploads evidence to Supabase Storage bucket `wo-evidence` and registers a single
 * reusable `attachmentId` in `wo_attachments`.
 */
export async function uploadWOEvidence(
  workOrderId: string,
  userId: string,
  file: File,
): Promise<WOAttachment> {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase client is not initialized');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${workOrderId}/${Date.now()}_${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from('wo-evidence')
    .upload(storagePath, file, { upsert: false });

  if (uploadErr) {
    throw new Error(`Storage upload failed: ${uploadErr.message}`);
  }

  const { data: attRow, error: dbErr } = await supabase
    .from('wo_attachments')
    .insert({
      work_order_id: workOrderId,
      uploaded_by: userId,
      storage_bucket: 'wo-evidence',
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size_bytes: file.size,
    })
    .select('*')
    .single();

  if (dbErr || !attRow) {
    throw new Error(dbErr?.message || 'Failed to record attachment metadata');
  }

  const { data: signed } = await supabase.storage
    .from('wo-evidence')
    .createSignedUrl(storagePath, 3600);

  return { ...(attRow as WOAttachment), signed_url: signed?.signedUrl };
}

export const NexusService = {
  // Bootstrap & Admin Users
  bootstrapSuperAdmin: (payload: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
  }) =>
    apiFetch<{ success: boolean; userId: string }>('/api/bootstrap/super-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminCreateUser: (payload: AdminCreateUserPayload) =>
    apiFetch<{ user: UserProfile }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminUpdateUser: (id: string, updates: Partial<UserProfile>) =>
    apiFetch<{ user: UserProfile }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  triggerRemapCheck: (vendorId: string) =>
    apiFetch<{ flaggedCount: number }>('/api/admin/mappings/remap-check', {
      method: 'POST',
      body: JSON.stringify({ vendor_id: vendorId }),
    }),

  // Leader Operations (Strictly 4 capabilities)
  leaderCreateInstaller: (payload: CreateInstallerPayload) =>
    apiFetch<{ user: UserProfile }>('/api/leader/installers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  assignOrReassignInstaller: (
    workOrderId: string,
    installerId: string,
    reason?: string,
  ) =>
    apiFetch<{ success: boolean; action: 'ASSIGN' | 'REASSIGN' }>(
      `/api/work-orders/${workOrderId}/assign`,
      {
        method: 'POST',
        body: JSON.stringify({ installer_id: installerId, reason }),
      },
    ),

  // Import (Dispatch only)
  executeImport: (payload: ExecuteImportPayload) =>
    apiFetch<{ batch: ImportBatch; createdCount: number }>('/api/work-orders/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  fetchImportBatchRows: async (batchId: string): Promise<ImportBatchRow[]> => {
    const supabase = await getSupabaseClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('import_batch_rows')
      .select('*')
      .eq('batch_id', batchId)
      .order('row_index', { ascending: true });
    return (data ?? []) as ImportBatchRow[];
  },

  // LiveChat & PROGRESS Check-in
  sendChatMessage: (
    workOrderId: string,
    category: ChatCategory,
    content: string,
    attachmentId?: string | null,
  ) =>
    apiFetch<{ message: WOChatMessage; triggeredCheckIn: boolean }>(
      `/api/work-orders/${workOrderId}/chat`,
      {
        method: 'POST',
        body: JSON.stringify({ category, content, attachment_id: attachmentId || null }),
      },
    ),

  // Material Requests
  submitMaterialRequest: (
    workOrderId: string,
    payload: SubmitMaterialRequestPayload,
  ) =>
    apiFetch<{ materialRequest: MaterialRequestItem }>(
      `/api/work-orders/${workOrderId}/material-requests`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  decideMaterialRequest: (
    workOrderId: string,
    reqId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewNote: string,
  ) =>
    apiFetch<{ materialRequest: MaterialRequestItem }>(
      `/api/work-orders/${workOrderId}/material-requests/${reqId}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, review_note: reviewNote }),
      },
    ),

  // Technical Report & Check-out
  submitReport: (workOrderId: string, payload: SubmitReportPayload) =>
    apiFetch(`/api/work-orders/${workOrderId}/report`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Dispatch Review & Final Closing
  reviewReport: (workOrderId: string, payload: ReviewReportPayload) =>
    apiFetch(`/api/work-orders/${workOrderId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  finalClose: (workOrderId: string, payload: FinalClosePayload) =>
    apiFetch(`/api/work-orders/${workOrderId}/close`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Issues & Escalations
  createIssue: (
    workOrderId: string,
    payload: {
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      title: string;
      description: string;
    },
  ) =>
    apiFetch(`/api/work-orders/${workOrderId}/issues`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Team tasks update
  updateTeamTasks: async (workOrderId: string, teamTasks: WorkOrder['team_tasks']) => {
    const supabase = await getSupabaseClient();
    if (!supabase) throw new Error('Supabase client is not initialized');
    const { error } = await supabase
      .from('work_orders')
      .update({ team_tasks: teamTasks, updated_at: new Date().toISOString() })
      .eq('id', workOrderId);
    if (error) throw new Error(error.message);
  },

  // Super Admin Config updates
  updateAdminConfiguration: async (
    moduleKey: string,
    configData: Record<string, unknown>,
    actorId: string,
  ) => {
    const supabase = await getSupabaseClient();
    if (!supabase) throw new Error('Supabase client is not initialized');
    const { error } = await supabase
      .from('admin_configurations')
      .update({
        config_data: configData,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('module_key', moduleKey);
    if (error) throw new Error(error.message);

    await supabase.from('audit_logs').insert({
      actor_id: actorId,
      actor_role: 'SUPER_ADMIN',
      module_key: moduleKey,
      action: 'UPDATE_CONFIGURATION',
      target_id: moduleKey,
      payload: configData,
    });
  },
};
