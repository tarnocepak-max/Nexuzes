export type AppLanguage = 'id' | 'en';
export type DisplayMode = 'desktop' | 'mobile';

export type UserRole = 'SUPER_ADMIN' | 'DISPATCH' | 'LEADER' | 'INSTALLER';

export type SidebarMenuKey =
  | 'dashboard'
  | 'tickets'
  | 'report'
  | 'management_staff'
  | 'import'
  | 'coordination_center';

export type InstallerTabKey =
  | 'dashboard'
  | 'my_tickets'
  | 'reports'
  | 'coordination'
  | 'profile';

export type SettingsRouteKey = 'system_settings';

export type ActiveRoute =
  | SidebarMenuKey
  | InstallerTabKey
  | SettingsRouteKey
  | 'ticket_fullview';

export type ChatCategory = 'PROGRESS' | 'ISSUE' | 'REQUEST' | 'GENERAL';
export type MaterialRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';
export type ReviewDecision = 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
export type TechnicalWorkOutcome =
  | 'COMPLETED'
  | 'PARTIAL_COMPLETED'
  | 'RESCHEDULE'
  | 'PENDING_FOLLOWUP';
export type AdministrativeClosure = 'CLOSED' | 'OPEN_HOLD' | 'CANCELLED_OR_VOID';

export type GroupingCaseCode =
  | 'CASE_1_SINGLE_LEADER_AREA_MATCH'
  | 'CASE_2_SINGLE_LEADER_WILDCARD_AREA'
  | 'CASE_3_MULTI_MAPPING_AREA_MATCH'
  | 'CASE_4_VENDOR_NOT_FOUND'
  | 'CASE_5_VENDOR_INACTIVE'
  | 'CASE_6_LEADER_MAPPING_MISSING'
  | 'CASE_7_LEADER_INACTIVE'
  | 'CASE_8_MAPPING_AMBIGUOUS';

export type SortDirection = 'ASC' | 'DESC' | 'DEFAULT';

export interface UniversalTableQueryState {
  globalSearch: string;
  columnSearch: Record<string, string>;
  columnFilters: Record<string, string>;
  sortField: string | null;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at?: string;
}

export interface Area {
  id: string;
  code: string;
  name: string;
  region?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: UserRole;
  vendor_id?: string | null;
  area_ids: string[];
  is_active: boolean;
  preferred_language: AppLanguage;
  created_at?: string;
}

export interface LeaderVendorMapping {
  id: string;
  vendor_id: string;
  area_id?: string | null;
  leader_id: string;
  is_active: boolean;
  created_at?: string;
}

export interface TeamTaskItem {
  id: string;
  title: string;
  completed: boolean;
  updated_at: string;
  updated_by_name: string;
}

export interface WorkOrder {
  id: string;
  wo_number: string;
  import_batch_id?: string | null;
  original_import_payload: Record<string, unknown>;
  customer_name: string;
  customer_phone?: string | null;
  customer_id_ref?: string | null;
  service_type?: string | null;
  appointment_date?: string | null;
  appointment_slot?: string | null;
  sla_due_at?: string | null;
  network_odp?: string | null;
  network_ont_sn?: string | null;
  network_vlan?: string | null;
  network_notes?: string | null;
  address_line: string;
  district?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  raw_vendor_name?: string | null;
  vendor_id?: string | null;
  raw_area_name?: string | null;
  area_id?: string | null;
  grouping_case?: GroupingCaseCode | null;
  grouping_exception?: string | null;
  leader_id?: string | null;
  assigned_installer_id?: string | null;
  assigned_at?: string | null;
  team_tasks: TeamTaskItem[];
  check_in_at?: string | null;
  check_in_message_id?: string | null;
  latest_check_out_at?: string | null;
  progress_percent: number;
  progress_summary?: string | null;
  operational_status: string;
  technical_outcome?: TechnicalWorkOutcome | null;
  administrative_closure: AdministrativeClosure;
  active_wo_remapped_pending: boolean;
  latest_review_decision?: ReviewDecision | null;
  closing_l1_label?: string | null;
  closing_l2_label?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WOAssignmentRecord {
  id: string;
  work_order_id: string;
  session_segment_no: number;
  action_type: 'ASSIGN' | 'REASSIGN';
  previous_installer_id?: string | null;
  new_installer_id: string;
  assigned_by: string;
  reason?: string | null;
  is_active_segment: boolean;
  archived_at?: string | null;
  created_at: string;
}

export interface WOAttachment {
  id: string;
  work_order_id: string;
  uploaded_by: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  signed_url?: string;
}

export interface WOChatMessage {
  id: string;
  work_order_id: string;
  sender_id: string;
  sender_role: UserRole;
  category: ChatCategory;
  content: string;
  attachment_id?: string | null;
  triggered_check_in: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MaterialRequestItem {
  id: string;
  work_order_id: string;
  requester_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  description?: string | null;
  attachment_id?: string | null;
  status: MaterialRequestStatus;
  reviewed_by?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface WOReportVersion {
  id: string;
  work_order_id: string;
  installer_id: string;
  revision_no: number;
  report_l1_code: string;
  report_l1_label: string;
  report_l2_code: string;
  report_l2_label: string;
  technical_findings: string;
  work_description: string;
  additional_notes?: string | null;
  technical_measurements: Record<string, string>;
  evidence_attachment_ids: string[];
  check_in_at_snapshot: string;
  check_out_at: string;
  submitted_at: string;
}

export interface WOReviewRecord {
  id: string;
  work_order_id: string;
  report_id: string;
  reviewer_id: string;
  decision: ReviewDecision;
  review_notes: string;
  created_at: string;
}

export interface WOIssueRecord {
  id: string;
  work_order_id: string;
  reported_by: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  status: 'OPEN' | 'ESCALATED' | 'RESOLVED';
  resolved_by?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

// EXACT 15-FIELD APPEND-ONLY FINAL WO HISTORY RECORD
export interface FinalWOHistoryRecord {
  history_id: string;
  work_order_id: string;
  wo_number: string;
  sequence_no: number;
  event_type: string;
  actor_id: string;
  actor_role: UserRole;
  previous_operational_status: string | null;
  new_operational_status: string;
  technical_outcome_snapshot: string | null;
  administrative_closure_snapshot: string;
  category_l1_label_snapshot: string | null;
  category_l2_label_snapshot: string | null;
  summary_note: string | null;
  occurred_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  work_order_id?: string | null;
  event_type: string;
  message: string;
  destination_route: string;
  is_read: boolean;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  batch_code: string;
  source_type: 'CSV' | 'XLSX' | 'TEXT_TO_TABLE';
  file_name?: string | null;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  column_mapping: Record<string, string>;
  imported_by: string;
  status: string;
  created_at: string;
}

export interface ImportBatchRow {
  id?: string;
  batch_id?: string;
  row_index: number;
  raw_payload: Record<string, string>;
  validation_status: 'VALID' | 'INVALID' | 'DUPLICATE';
  errors: string[];
  work_order_id?: string | null;
}

export interface AdminConfiguration {
  module_key: string;
  module_title: string;
  config_data: Record<string, unknown>;
  updated_by?: string | null;
  updated_at?: string;
}

export interface AuditLogItem {
  id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  module_key: string;
  action: string;
  target_id?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// TYPED SERVICE CONTRACTS FROM BLUEPRINT SECTION 17
export interface IWorkOrderService {
  listWorkOrders: () => Promise<WorkOrder[]>;
  getWorkOrderBundle: (workOrderId: string) => Promise<WorkOrderFullviewBundle>;
  submitReport: (workOrderId: string, payload: SubmitReportPayload) => Promise<void>;
  reviewReport: (workOrderId: string, payload: ReviewReportPayload) => Promise<void>;
  finalClose: (workOrderId: string, payload: FinalClosePayload) => Promise<void>;
  submitMaterialRequest: (workOrderId: string, payload: SubmitMaterialRequestPayload) => Promise<void>;
  decideMaterialRequest: (
    workOrderId: string,
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewNote: string,
  ) => Promise<void>;
}

export interface ILeaderTeamService {
  assignInstaller: (workOrderId: string, installerId: string, reason?: string) => Promise<void>;
  reassignInstaller: (workOrderId: string, newInstallerId: string, reason: string) => Promise<void>;
  createVendorInstaller: (payload: CreateInstallerPayload) => Promise<UserProfile>;
}

export interface IImportService {
  listBatches: () => Promise<ImportBatch[]>;
  executeImport: (payload: ExecuteImportPayload) => Promise<{ batch: ImportBatch; createdCount: number }>;
}

export interface IVendorGroupingService {
  evaluateGrouping: (input: GroupingEvaluationInput) => GroupingEvaluationResult;
}

export interface ILiveChatService {
  sendMessage: (
    workOrderId: string,
    category: ChatCategory,
    content: string,
    attachmentId?: string | null,
  ) => Promise<{ message: WOChatMessage; triggeredCheckIn: boolean }>;
}

export interface IAdminService {
  listConfigurations: () => Promise<AdminConfiguration[]>;
  updateConfiguration: (moduleKey: string, configData: Record<string, unknown>) => Promise<void>;
  createUser: (payload: AdminCreateUserPayload) => Promise<UserProfile>;
}

export interface WorkOrderFullviewBundle {
  workOrder: WorkOrder;
  assignments: WOAssignmentRecord[];
  attachments: WOAttachment[];
  chatMessages: WOChatMessage[];
  materialRequests: MaterialRequestItem[];
  reports: WOReportVersion[];
  reviews: WOReviewRecord[];
  issues: WOIssueRecord[];
  finalHistory: FinalWOHistoryRecord[];
}

export interface SubmitReportPayload {
  report_l1_code: string;
  report_l1_label: string;
  report_l2_code: string;
  report_l2_label: string;
  technical_findings: string;
  work_description: string;
  additional_notes?: string;
  technical_measurements?: Record<string, string>;
  evidence_attachment_ids?: string[];
}

export interface ReviewReportPayload {
  report_id: string;
  decision: ReviewDecision;
  review_notes: string;
}

export interface FinalClosePayload {
  closing_l1_code: string;
  closing_l1_label: string;
  closing_l2_code: string;
  closing_l2_label: string;
  technical_outcome: TechnicalWorkOutcome;
  administrative_closure: AdministrativeClosure;
  operational_status: string;
  closing_notes: string;
}

export interface SubmitMaterialRequestPayload {
  item_name: string;
  quantity: number;
  unit: string;
  description?: string;
  attachment_id?: string | null;
}

export interface CreateInstallerPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  area_ids: string[];
}

export interface AdminCreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  vendor_id?: string | null;
  area_ids: string[];
}

export interface ExecuteImportPayload {
  source_type: 'CSV' | 'XLSX' | 'TEXT_TO_TABLE';
  file_name?: string;
  column_mapping: Record<string, string>;
  rows: Array<{
    row_index: number;
    raw_payload: Record<string, string>;
    mapped: {
      wo_number: string;
      customer_name: string;
      customer_phone?: string;
      customer_id_ref?: string;
      service_type?: string;
      appointment_date?: string;
      appointment_slot?: string;
      network_odp?: string;
      network_ont_sn?: string;
      network_vlan?: string;
      address_line: string;
      district?: string;
      city?: string;
      raw_vendor_name: string;
      raw_area_name: string;
    };
    validation_status: 'VALID' | 'INVALID' | 'DUPLICATE';
    errors: string[];
  }>;
}

export interface GroupingEvaluationInput {
  rawVendorName: string;
  rawAreaName: string;
  vendors: Vendor[];
  areas: Area[];
  mappings: LeaderVendorMapping[];
  leaders: UserProfile[];
}

export interface GroupingEvaluationResult {
  vendorId: string | null;
  areaId: string | null;
  leaderId: string | null;
  groupingCase: GroupingCaseCode;
  groupingException: string | null;
  operationalStatus: 'GROUPED' | 'GROUPING_EXCEPTION';
}

export const ROLE_META: Record<
  UserRole,
  { label: string; color: string; bgTint: string; borderTint: string }
> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    color: '#6D28D9',
    bgTint: 'bg-[#6D28D9]/10 text-[#6D28D9]',
    borderTint: 'border-[#6D28D9]/30',
  },
  DISPATCH: {
    label: 'Dispatch',
    color: '#2563EB',
    bgTint: 'bg-[#2563EB]/10 text-[#2563EB]',
    borderTint: 'border-[#2563EB]/30',
  },
  LEADER: {
    label: 'Leader / Korlap',
    color: '#0D9488',
    bgTint: 'bg-[#0D9488]/10 text-[#0D9488]',
    borderTint: 'border-[#0D9488]/30',
  },
  INSTALLER: {
    label: 'Installer / Technician',
    color: '#D97706',
    bgTint: 'bg-[#D97706]/10 text-[#D97706]',
    borderTint: 'border-[#D97706]/30',
  },
};

export const TICKET_FULLVIEW_SECTIONS = [
  { index: 1, key: 'wo_header', title: 'WO Header & Status' },
  { index: 2, key: 'customer_info', title: 'Customer Information' },
  { index: 3, key: 'appointment_info', title: 'Appointment Information' },
  { index: 4, key: 'network_info', title: 'Network Information' },
  { index: 5, key: 'location_address', title: 'Location & Address' },
  { index: 6, key: 'vendor_area', title: 'Contractor/Vendor & Area' },
  { index: 7, key: 'leader_installer_assignment', title: 'Leader & Installer Assignment' },
  { index: 8, key: 'team_tasks', title: 'Team Tasks' },
  { index: 9, key: 'work_progress_checkin', title: 'Work Progress & Check-in/Check-out' },
  { index: 10, key: 'livechat_evidence', title: 'LiveChat & Evidence' },
  { index: 11, key: 'material_request', title: 'Material Request' },
  { index: 12, key: 'installer_technical_report', title: 'Installer Technical Report' },
  { index: 13, key: 'dispatch_review', title: 'Dispatch Review' },
  { index: 14, key: 'dispatch_closing', title: 'Dispatch Closing' },
  { index: 15, key: 'issue_escalation', title: 'Issue & Escalation' },
  { index: 16, key: 'activity_timeline', title: 'Activity Timeline' },
  { index: 17, key: 'final_wo_history', title: 'Final WO History' },
] as const;

export const SUPER_ADMIN_CONFIG_MODULES = [
  { key: 'user_management', index: 1, title: 'User Management' },
  { key: 'role_permission', index: 2, title: 'Role & Permission Management' },
  { key: 'vendor_management', index: 3, title: 'Contractor/Vendor Management' },
  { key: 'leader_vendor_mapping', index: 4, title: 'Leader-to-Vendor Mapping' },
  { key: 'area_mapping', index: 5, title: 'Area Mapping' },
  { key: 'installer_team', index: 6, title: 'Installer Team Management' },
  { key: 'installer_report_l1_l2', index: 7, title: 'Installer Report Level 1 & 2' },
  { key: 'dispatch_closing_l1_l2', index: 8, title: 'Dispatch Closing Level 1 & 2' },
  { key: 'chat_categories', index: 9, title: 'Chat Categories' },
  { key: 'notification_config', index: 10, title: 'Notification Configuration' },
  { key: 'wo_status_config', index: 11, title: 'Work Order Status Configuration' },
  { key: 'table_column_config', index: 12, title: 'Table Column Configuration' },
  { key: 'menu_config', index: 13, title: 'Menu Configuration' },
  { key: 'language_config', index: 14, title: 'Language Configuration' },
  { key: 'personalization', index: 15, title: 'Personalization' },
  { key: 'system_monitoring', index: 16, title: 'System Monitoring' },
  { key: 'audit_history', index: 17, title: 'Audit History' },
] as const;
