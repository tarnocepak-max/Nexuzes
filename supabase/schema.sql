-- ============================================================================
-- NEXUSOPS — SUPABASE POSTGRESQL SCHEMA, RLS, TRIGGERS & STORAGE
-- Strictly follows NexusOps Master AppFlow & N0 Blueprint
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. ONE-TIME INITIAL SUPER ADMIN BOOTSTRAP LOCK
create table if not exists public.bootstrap_state (
  id boolean primary key default true check (id = true),
  is_initialized boolean not null default false,
  initialized_by uuid,
  initialized_at timestamptz
);

insert into public.bootstrap_state (id, is_initialized)
values (true, false)
on conflict (id) do nothing;

-- 2. MASTER VENDOR & AREA TABLES
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. USER PROFILES (EXACTLY 4 ROLES)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  phone text,
  role text not null check (role in ('SUPER_ADMIN', 'DISPATCH', 'LEADER', 'INSTALLER')),
  vendor_id uuid references public.vendors(id) on delete set null,
  area_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  preferred_language text not null default 'id' check (preferred_language in ('id', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_vendor on public.profiles(vendor_id);

-- 4. LEADER-TO-VENDOR & AREA MAPPING (FOR 8-CASE GROUPING)
create table if not exists public.leader_vendor_mappings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lvm_vendor on public.leader_vendor_mappings(vendor_id, area_id, is_active);

-- 5. IMPORT BATCHES & ROW DIAGNOSTICS
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text unique not null,
  source_type text not null check (source_type in ('CSV', 'XLSX', 'TEXT_TO_TABLE')),
  file_name text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  column_mapping jsonb not null default '{}'::jsonb,
  imported_by uuid not null references public.profiles(id),
  status text not null default 'COMPLETED',
  created_at timestamptz not null default now()
);

create table if not exists public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_index integer not null,
  raw_payload jsonb not null,
  validation_status text not null check (validation_status in ('VALID', 'INVALID', 'DUPLICATE')),
  errors jsonb not null default '[]'::jsonb,
  work_order_id uuid,
  created_at timestamptz not null default now()
);

-- 6. MASTER WORK ORDERS (SINGLE SOURCE OF TRUTH)
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  wo_number text unique not null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  original_import_payload jsonb not null default '{}'::jsonb,

  -- Customer Information (Section 2)
  customer_name text not null,
  customer_phone text,
  customer_id_ref text,
  service_type text,

  -- Appointment Information (Section 3)
  appointment_date date,
  appointment_slot text,
  sla_due_at timestamptz,

  -- Network Information (Section 4)
  network_odp text,
  network_ont_sn text,
  network_vlan text,
  network_notes text,

  -- Location & Address (Section 5)
  address_line text not null,
  district text,
  city text,
  latitude numeric,
  longitude numeric,

  -- Contractor/Vendor & Area (Section 6)
  raw_vendor_name text,
  vendor_id uuid references public.vendors(id) on delete set null,
  raw_area_name text,
  area_id uuid references public.areas(id) on delete set null,

  -- Automatic Grouping & Leader/Installer Assignment (Section 7)
  grouping_case text,
  grouping_exception text,
  leader_id uuid references public.profiles(id) on delete set null,
  assigned_installer_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,

  -- Team Tasks (Section 8)
  team_tasks jsonb not null default '[]'::jsonb,

  -- Work Progress & Check-in/Check-out (Section 9)
  check_in_at timestamptz,
  check_in_message_id uuid,
  latest_check_out_at timestamptz,
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  progress_summary text,

  -- Status Separation (Section 1, 13, 14)
  operational_status text not null default 'IMPORTED',
  technical_outcome text check (technical_outcome in ('COMPLETED', 'PARTIAL_COMPLETED', 'RESCHEDULE', 'PENDING_FOLLOWUP')),
  administrative_closure text not null default 'OPEN_HOLD' check (administrative_closure in ('CLOSED', 'OPEN_HOLD', 'CANCELLED_OR_VOID')),
  active_wo_remapped_pending boolean not null default false,
  latest_review_decision text check (latest_review_decision in ('APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION')),
  closing_l1_label text,
  closing_l2_label text,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wo_vendor on public.work_orders(vendor_id);
create index if not exists idx_wo_leader on public.work_orders(leader_id);
create index if not exists idx_wo_installer on public.work_orders(assigned_installer_id);
create index if not exists idx_wo_status on public.work_orders(operational_status);

-- 7. ASSIGNMENT & REASSIGNMENT HISTORY (SESSION SEGMENTS)
create table if not exists public.wo_assignments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  session_segment_no integer not null default 1,
  action_type text not null check (action_type in ('ASSIGN', 'REASSIGN')),
  previous_installer_id uuid references public.profiles(id) on delete set null,
  new_installer_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  reason text,
  is_active_segment boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_wo_assignments_wo on public.wo_assignments(work_order_id);

-- 8. SHARED EVIDENCE ATTACHMENTS (SINGLE attachmentId REFERENCE)
create table if not exists public.wo_attachments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_bucket text not null default 'wo-evidence',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

-- 9. LIVECHAT MESSAGES (SECTION 10)
create table if not exists public.wo_chat_messages (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  sender_role text not null,
  category text not null check (category in ('PROGRESS', 'ISSUE', 'REQUEST', 'GENERAL')),
  content text not null,
  attachment_id uuid references public.wo_attachments(id) on delete set null,
  triggered_check_in boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wo_chat_wo on public.wo_chat_messages(work_order_id, created_at);

-- 10. MATERIAL REQUESTS (SECTION 11 — DISPATCH APPROVES/REJECTS)
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  item_name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  description text,
  attachment_id uuid references public.wo_attachments(id) on delete set null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 11. INSTALLER TECHNICAL REPORTS (SECTION 12 — VERSIONED & CHECK-OUT SNAPSHOT)
create table if not exists public.wo_reports (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  installer_id uuid not null references public.profiles(id) on delete restrict,
  revision_no integer not null default 1,
  report_l1_code text not null,
  report_l1_label text not null,
  report_l2_code text not null,
  report_l2_label text not null,
  technical_findings text not null,
  work_description text not null,
  additional_notes text,
  technical_measurements jsonb not null default '{}'::jsonb,
  evidence_attachment_ids uuid[] not null default '{}',
  check_in_at_snapshot timestamptz not null,
  check_out_at timestamptz not null default now(),
  submitted_at timestamptz not null default now()
);

create index if not exists idx_wo_reports_wo on public.wo_reports(work_order_id, revision_no);

-- 12. DISPATCH REVIEW (SECTION 13)
create table if not exists public.wo_reviews (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  report_id uuid not null references public.wo_reports(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION')),
  review_notes text not null,
  created_at timestamptz not null default now()
);

-- 13. ISSUE & ESCALATION (SECTION 15)
create table if not exists public.wo_issues (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  reported_by uuid not null references public.profiles(id) on delete restrict,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  title text not null,
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'ESCALATED', 'RESOLVED')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 14. FINAL WO HISTORY (EXACT 15-FIELD APPEND-ONLY IMMUTABLE TABLE)
create table if not exists public.final_wo_history (
  history_id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  wo_number text not null,
  sequence_no integer not null,
  event_type text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  previous_operational_status text,
  new_operational_status text not null,
  technical_outcome_snapshot text,
  administrative_closure_snapshot text not null,
  category_l1_label_snapshot text,
  category_l2_label_snapshot text,
  summary_note text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_final_history_wo on public.final_wo_history(work_order_id, sequence_no);

-- Prevent UPDATE or DELETE on final_wo_history (strictly append-only)
create or replace function public.prevent_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'final_wo_history is strictly append-only and immutable';
end;
$$;

drop trigger if exists trg_final_wo_history_immutable on public.final_wo_history;
create trigger trg_final_wo_history_immutable
  before update or delete on public.final_wo_history
  for each row execute function public.prevent_history_mutation();

-- 15. NOTIFICATIONS & SUPER ADMIN 17 CONFIG MODULES & AUDIT LOGS
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  event_type text not null,
  message text not null,
  destination_route text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications(recipient_id, is_read, created_at desc);

create table if not exists public.admin_configurations (
  module_key text primary key,
  module_title text not null,
  config_data jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  module_key text not null,
  action text not null,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- HELPER FUNCTIONS FOR ROW LEVEL SECURITY (RLS)
-- ============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true limit 1;
$$;

create or replace function public.current_user_vendor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select vendor_id from public.profiles where id = auth.uid() and is_active = true limit 1;
$$;

create or replace function public.can_access_work_order(wo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_orders w
    where w.id = wo_id
      and (
        public.current_user_role() in ('SUPER_ADMIN', 'DISPATCH')
        or (
          public.current_user_role() = 'LEADER'
          and w.vendor_id = public.current_user_vendor_id()
        )
        or (
          public.current_user_role() = 'INSTALLER'
          and (
            w.assigned_installer_id = auth.uid()
            or exists (
              select 1 from public.wo_assignments a
              where a.work_order_id = w.id
                and (a.new_installer_id = auth.uid() or a.previous_installer_id = auth.uid())
            )
          )
        )
      )
  );
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ACROSS ALL TABLES
-- ============================================================================

alter table public.bootstrap_state enable row level security;
alter table public.vendors enable row level security;
alter table public.areas enable row level security;
alter table public.profiles enable row level security;
alter table public.leader_vendor_mappings enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_batch_rows enable row level security;
alter table public.work_orders enable row level security;
alter table public.wo_assignments enable row level security;
alter table public.wo_attachments enable row level security;
alter table public.wo_chat_messages enable row level security;
alter table public.material_requests enable row level security;
alter table public.wo_reports enable row level security;
alter table public.wo_reviews enable row level security;
alter table public.wo_issues enable row level security;
alter table public.final_wo_history enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_configurations enable row level security;
alter table public.audit_logs enable row level security;

-- BOOTSTRAP STATE: readable by authenticated only via server; deny direct client edits
drop policy if exists "bootstrap_read_auth" on public.bootstrap_state;
create policy "bootstrap_read_auth" on public.bootstrap_state for select to authenticated using (true);

-- PROFILES
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped" on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.current_user_role() in ('SUPER_ADMIN', 'DISPATCH')
  or (
    public.current_user_role() = 'LEADER'
    and vendor_id = public.current_user_vendor_id()
  )
);

drop policy if exists "profiles_update_self_lang" on public.profiles;
create policy "profiles_update_self_lang" on public.profiles for update to authenticated
using (id = auth.uid() or public.current_user_role() = 'SUPER_ADMIN')
with check (id = auth.uid() or public.current_user_role() = 'SUPER_ADMIN');

-- VENDORS & AREAS & MAPPINGS
drop policy if exists "vendors_select_auth" on public.vendors;
create policy "vendors_select_auth" on public.vendors for select to authenticated using (true);

drop policy if exists "vendors_admin_write" on public.vendors;
create policy "vendors_admin_write" on public.vendors for all to authenticated
using (public.current_user_role() = 'SUPER_ADMIN')
with check (public.current_user_role() = 'SUPER_ADMIN');

drop policy if exists "areas_select_auth" on public.areas;
create policy "areas_select_auth" on public.areas for select to authenticated using (true);

drop policy if exists "areas_admin_write" on public.areas;
create policy "areas_admin_write" on public.areas for all to authenticated
using (public.current_user_role() = 'SUPER_ADMIN')
with check (public.current_user_role() = 'SUPER_ADMIN');

drop policy if exists "lvm_select_auth" on public.leader_vendor_mappings;
create policy "lvm_select_auth" on public.leader_vendor_mappings for select to authenticated using (true);

drop policy if exists "lvm_admin_write" on public.leader_vendor_mappings;
create policy "lvm_admin_write" on public.leader_vendor_mappings for all to authenticated
using (public.current_user_role() = 'SUPER_ADMIN')
with check (public.current_user_role() = 'SUPER_ADMIN');

-- IMPORT BATCHES (Dispatch executes; Super Admin read-only monitoring)
drop policy if exists "import_batches_select" on public.import_batches;
create policy "import_batches_select" on public.import_batches for select to authenticated
using (public.current_user_role() in ('SUPER_ADMIN', 'DISPATCH'));

drop policy if exists "import_batches_dispatch_insert" on public.import_batches;
create policy "import_batches_dispatch_insert" on public.import_batches for insert to authenticated
with check (public.current_user_role() = 'DISPATCH');

drop policy if exists "import_rows_select" on public.import_batch_rows;
create policy "import_rows_select" on public.import_batch_rows for select to authenticated
using (public.current_user_role() in ('SUPER_ADMIN', 'DISPATCH'));

drop policy if exists "import_rows_dispatch_insert" on public.import_batch_rows;
create policy "import_rows_dispatch_insert" on public.import_batch_rows for insert to authenticated
with check (public.current_user_role() = 'DISPATCH');

-- WORK ORDERS (Master WO)
drop policy if exists "wo_select_scoped" on public.work_orders;
create policy "wo_select_scoped" on public.work_orders for select to authenticated
using (public.can_access_work_order(id));

drop policy if exists "wo_dispatch_insert" on public.work_orders;
create policy "wo_dispatch_insert" on public.work_orders for insert to authenticated
with check (public.current_user_role() = 'DISPATCH');

drop policy if exists "wo_update_scoped" on public.work_orders;
create policy "wo_update_scoped" on public.work_orders for update to authenticated
using (public.can_access_work_order(id))
with check (public.can_access_work_order(id));

-- WO ASSIGNMENTS
drop policy if exists "wo_assignments_select" on public.wo_assignments;
create policy "wo_assignments_select" on public.wo_assignments for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "wo_assignments_leader_insert" on public.wo_assignments;
create policy "wo_assignments_leader_insert" on public.wo_assignments for insert to authenticated
with check (
  public.current_user_role() = 'LEADER'
  and public.can_access_work_order(work_order_id)
);

-- WO ATTACHMENTS
drop policy if exists "wo_attachments_select" on public.wo_attachments;
create policy "wo_attachments_select" on public.wo_attachments for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "wo_attachments_insert" on public.wo_attachments;
create policy "wo_attachments_insert" on public.wo_attachments for insert to authenticated
with check (
  public.current_user_role() in ('DISPATCH', 'INSTALLER')
  and public.can_access_work_order(work_order_id)
);

-- LIVECHAT MESSAGES (Leader strictly monitoring-only per OBD-06)
drop policy if exists "wo_chat_select" on public.wo_chat_messages;
create policy "wo_chat_select" on public.wo_chat_messages for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "wo_chat_insert_no_leader" on public.wo_chat_messages;
create policy "wo_chat_insert_no_leader" on public.wo_chat_messages for insert to authenticated
with check (
  public.current_user_role() in ('INSTALLER', 'DISPATCH', 'SUPER_ADMIN')
  and public.can_access_work_order(work_order_id)
  and sender_id = auth.uid()
);

-- MATERIAL REQUESTS (Installer inserts, Leader monitoring-only, Dispatch approves/rejects per OBD-05)
drop policy if exists "material_req_select" on public.material_requests;
create policy "material_req_select" on public.material_requests for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "material_req_installer_insert" on public.material_requests;
create policy "material_req_installer_insert" on public.material_requests for insert to authenticated
with check (
  public.current_user_role() = 'INSTALLER'
  and requester_id = auth.uid()
  and public.can_access_work_order(work_order_id)
);

drop policy if exists "material_req_dispatch_update" on public.material_requests;
create policy "material_req_dispatch_update" on public.material_requests for update to authenticated
using (public.current_user_role() = 'DISPATCH')
with check (public.current_user_role() = 'DISPATCH');

-- INSTALLER TECHNICAL REPORTS
drop policy if exists "wo_reports_select" on public.wo_reports;
create policy "wo_reports_select" on public.wo_reports for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "wo_reports_installer_insert" on public.wo_reports;
create policy "wo_reports_installer_insert" on public.wo_reports for insert to authenticated
with check (
  public.current_user_role() = 'INSTALLER'
  and installer_id = auth.uid()
  and public.can_access_work_order(work_order_id)
);

-- DISPATCH REVIEWS (Dispatch exclusive)
drop policy if exists "wo_reviews_select" on public.wo_reviews;
create policy "wo_reviews_select" on public.wo_reviews for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "wo_reviews_dispatch_insert" on public.wo_reviews;
create policy "wo_reviews_dispatch_insert" on public.wo_reviews for insert to authenticated
with check (public.current_user_role() = 'DISPATCH');

-- ISSUES & ESCALATIONS
drop policy if exists "wo_issues_select" on public.wo_issues;
create policy "wo_issues_select" on public.wo_issues for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "wo_issues_insert" on public.wo_issues;
create policy "wo_issues_insert" on public.wo_issues for insert to authenticated
with check (
  public.current_user_role() in ('INSTALLER', 'DISPATCH')
  and public.can_access_work_order(work_order_id)
);

drop policy if exists "wo_issues_dispatch_update" on public.wo_issues;
create policy "wo_issues_dispatch_update" on public.wo_issues for update to authenticated
using (public.current_user_role() = 'DISPATCH');

-- FINAL WO HISTORY (APPEND-ONLY)
drop policy if exists "final_history_select" on public.final_wo_history;
create policy "final_history_select" on public.final_wo_history for select to authenticated
using (public.can_access_work_order(work_order_id));

drop policy if exists "final_history_insert" on public.final_wo_history;
create policy "final_history_insert" on public.final_wo_history for insert to authenticated
with check (public.can_access_work_order(work_order_id));

-- NOTIFICATIONS
drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own" on public.notifications for select to authenticated
using (recipient_id = auth.uid());

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists "notifications_insert_auth" on public.notifications;
create policy "notifications_insert_auth" on public.notifications for insert to authenticated
with check (true);

-- ADMIN CONFIGURATIONS & AUDIT LOGS
drop policy if exists "admin_config_read_auth" on public.admin_configurations;
create policy "admin_config_read_auth" on public.admin_configurations for select to authenticated using (true);

drop policy if exists "admin_config_super_write" on public.admin_configurations;
create policy "admin_config_super_write" on public.admin_configurations for all to authenticated
using (public.current_user_role() = 'SUPER_ADMIN')
with check (public.current_user_role() = 'SUPER_ADMIN');

drop policy if exists "audit_logs_read_admin" on public.audit_logs;
create policy "audit_logs_read_admin" on public.audit_logs for select to authenticated
using (public.current_user_role() = 'SUPER_ADMIN');

drop policy if exists "audit_logs_insert_auth" on public.audit_logs;
create policy "audit_logs_insert_auth" on public.audit_logs for insert to authenticated
with check (true);

-- ============================================================================
-- STORAGE BUCKETS & POLICIES (wo-evidence, import-batches)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('wo-evidence', 'wo-evidence', false), ('import-batches', 'import-batches', false)
on conflict (id) do nothing;

drop policy if exists "wo_evidence_read" on storage.objects;
create policy "wo_evidence_read" on storage.objects for select to authenticated
using (bucket_id = 'wo-evidence');

drop policy if exists "wo_evidence_upload" on storage.objects;
create policy "wo_evidence_upload" on storage.objects for insert to authenticated
with check (bucket_id = 'wo-evidence');

drop policy if exists "import_batches_read" on storage.objects;
create policy "import_batches_read" on storage.objects for select to authenticated
using (bucket_id = 'import-batches' and public.current_user_role() in ('SUPER_ADMIN', 'DISPATCH'));

drop policy if exists "import_batches_upload" on storage.objects;
create policy "import_batches_upload" on storage.objects for insert to authenticated
with check (bucket_id = 'import-batches' and public.current_user_role() = 'DISPATCH');

-- ============================================================================
-- DEFAULT SEED FOR 17 SUPER ADMIN CONFIGURATION MODULES
-- ============================================================================

insert into public.admin_configurations (module_key, module_title, config_data) values
('user_management', 'User Management', '{"allowSelfPasswordReset": true}'::jsonb),
('role_permission', 'Role & Permission Management', '{"strictFourRoles": true, "leaderLiveChatReply": false, "materialApprovalRole": "DISPATCH"}'::jsonb),
('vendor_management', 'Contractor/Vendor Management', '{"requireActiveVendorOnImport": true}'::jsonb),
('leader_vendor_mapping', 'Leader-to-Vendor Mapping', '{"enforceDeterministic8Case": true}'::jsonb),
('area_mapping', 'Area Mapping', '{"strictAreaMatchForAssignment": true}'::jsonb),
('installer_team', 'Installer Team Management', '{"maxConcurrentActiveWOs": 10}'::jsonb),
('installer_report_l1_l2', 'Installer Report Level 1 & 2', '{
  "levels": [
    {"code": "INSTALL_OK", "label": "Installation Completed", "children": [
      {"code": "OPTICAL_PASS", "label": "Optical Power Within Threshold (-18 to -24 dBm)"},
      {"code": "ONT_PROVISIONED", "label": "ONT Provisioned & Speedtest Verified"}
    ]},
    {"code": "PARTIAL_WORK", "label": "Partial Completion / Follow-up Needed", "children": [
      {"code": "CIVIL_PENDING", "label": "Civil / Ducting Support Pending"},
      {"code": "PORT_FULL", "label": "ODP Port Full — Splice Needed"}
    ]},
    {"code": "RESCHEDULE_REQ", "label": "Customer Reschedule Requested", "children": [
      {"code": "CUST_UNAVAILABLE", "label": "Customer Not At Premises"},
      {"code": "ACCESS_DENIED", "label": "Building / Estate Access Permit Needed"}
    ]},
    {"code": "TECH_PENDING", "label": "Technical Pending / Escalated", "children": [
      {"code": "NO_SIGNAL", "label": "No ODP Signal / Feeder Cut"},
      {"code": "DROP_TOO_FAR", "label": "Drop Cable Distance Exceeds Limit"}
    ]}
  ]
}'::jsonb),
('dispatch_closing_l1_l2', 'Dispatch Closing Level 1 & 2', '{
  "levels": [
    {"code": "CLOSE_SUCCESS", "label": "Completed & Verified", "outcome": "COMPLETED", "adminClosure": "CLOSED", "operationalStatus": "CLOSED", "children": [
      {"code": "FULL_ACTIVATION", "label": "Full Service Activation Verified"},
      {"code": "MIGRATION_DONE", "label": "Migration & Cutover Verified"}
    ]},
    {"code": "CLOSE_PARTIAL", "label": "Partial Completed", "outcome": "PARTIAL_COMPLETED", "adminClosure": "CLOSED", "operationalStatus": "CLOSED", "children": [
      {"code": "TEMP_BYPASS", "label": "Active with Temporary Bypass"},
      {"code": "MINOR_DOC_NOTE", "label": "Closed with Minor Field Note"}
    ]},
    {"code": "KEEP_RESCHEDULE", "label": "Reschedule Required", "outcome": "RESCHEDULE", "adminClosure": "OPEN_HOLD", "operationalStatus": "OPEN_RESCHEDULE", "children": [
      {"code": "NEW_APPT_NEEDED", "label": "Awaiting New Customer Appointment"},
      {"code": "PERMIT_WAIT", "label": "Awaiting Building Permit"}
    ]},
    {"code": "KEEP_PENDING", "label": "Pending Technical Follow-up", "outcome": "PENDING_FOLLOWUP", "adminClosure": "OPEN_HOLD", "operationalStatus": "OPEN_PENDING", "children": [
      {"code": "OSP_REPAIR", "label": "Waiting OSP / Feeder Repair"},
      {"code": "MATERIAL_WAIT", "label": "Waiting Material Allocation"}
    ]}
  ]
}'::jsonb),
('chat_categories', 'Chat Categories', '{"categories": ["PROGRESS", "ISSUE", "REQUEST", "GENERAL"], "checkInCategory": "PROGRESS"}'::jsonb),
('notification_config', 'Notification Configuration', '{"enabledEvents": ["WO_ASSIGNED","WO_REASSIGNED","PROGRESS_SUBMITTED","MATERIAL_REQUEST_SUBMITTED","MATERIAL_REQUEST_DECIDED","ISSUE_CREATED","REPORT_SUBMITTED","REPORT_RETURNED","REPORT_REJECTED","REPORT_APPROVED","FINAL_CLOSING_COMPLETED"]}'::jsonb),
('wo_status_config', 'Work Order Status Configuration', '{"statuses": ["IMPORTED","GROUPED","GROUPING_EXCEPTION","ASSIGNED","IN_PROGRESS","REPORT_SUBMITTED","REVISION_ACTIVE","REJECTED_FOLLOWUP_ACTIVE","APPROVED_READY_CLOSING","OPEN_RESCHEDULE","OPEN_PENDING","CLOSED"]}'::jsonb),
('table_column_config', 'Table Column Configuration', '{"defaultVisible": ["wo_number","customer_name","vendor","area","assigned_installer","operational_status","appointment_date","check_in_at"]}'::jsonb),
('menu_config', 'Menu Configuration', '{"sidebarCount": 6, "installerBottomTabs": 5}'::jsonb),
('language_config', 'Language Configuration', '{"defaultLanguage": "id", "supported": ["id", "en"]}'::jsonb),
('personalization', 'Personalization', '{"theme": "light-enterprise", "primaryAccent": "#7C3AED"}'::jsonb),
('system_monitoring', 'System Monitoring', '{"retentionDays": 365}'::jsonb),
('audit_history', 'Audit History', '{"immutable": true}'::jsonb)
on conflict (module_key) do nothing;
