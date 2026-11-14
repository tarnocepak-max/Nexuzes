import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import { evaluateDeterministicVendorGrouping } from './src/lib/groupingEngine.ts';
import type {
  Area,
  ChatCategory,
  ExecuteImportPayload,
  FinalClosePayload,
  LeaderVendorMapping,
  ReviewReportPayload,
  SubmitMaterialRequestPayload,
  SubmitReportPayload,
  UserProfile,
  UserRole,
  Vendor,
} from './src/types/nexusops.ts';

const PORT = 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getMissingEnv(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

const supabaseAdmin: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

interface AuthedRequest extends Request {
  caller?: UserProfile;
}

async function checkSchemaReady(): Promise<{ ready: boolean; error?: string }> {
  if (!supabaseAdmin) return { ready: false, error: 'Missing Supabase credentials' };
  const { error } = await supabaseAdmin.from('bootstrap_state').select('id').limit(1);
  if (error) {
    return { ready: false, error: error.message };
  }
  return { ready: true };
}

function requireAdminClient(res: Response): SupabaseClient | null {
  if (!supabaseAdmin) {
    res.status(503).json({
      error: 'Supabase server client is not configured. Check environment secrets.',
      missingEnv: getMissingEnv(),
    });
    return null;
  }
  return supabaseAdmin;
}

function requireRole(allowedRoles: UserRole[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const admin = requireAdminClient(res);
    if (!admin) return;

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userData.user) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .single();

    if (profErr || !profile) {
      return res.status(403).json({ error: 'User profile not registered in NexusOps' });
    }

    const typedProfile = profile as UserProfile;
    if (!typedProfile.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    if (!allowedRoles.includes(typedProfile.role)) {
      return res.status(403).json({
        error: `Forbidden: role ${typedProfile.role} cannot perform this operation`,
      });
    }

    req.caller = typedProfile;
    return next();
  };
}

async function appendFinalHistory(
  admin: SupabaseClient,
  entry: {
    work_order_id: string;
    wo_number: string;
    event_type: string;
    actor_id: string;
    actor_role: UserRole;
    previous_operational_status: string | null;
    new_operational_status: string;
    technical_outcome_snapshot: string | null;
    administrative_closure_snapshot: string;
    category_l1_label_snapshot?: string | null;
    category_l2_label_snapshot?: string | null;
    summary_note?: string | null;
  },
) {
  const { data: lastRow } = await admin
    .from('final_wo_history')
    .select('sequence_no')
    .eq('work_order_id', entry.work_order_id)
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSeq = ((lastRow?.sequence_no as number | undefined) ?? 0) + 1;

  const { error } = await admin.from('final_wo_history').insert({
    work_order_id: entry.work_order_id,
    wo_number: entry.wo_number,
    sequence_no: nextSeq,
    event_type: entry.event_type,
    actor_id: entry.actor_id,
    actor_role: entry.actor_role,
    previous_operational_status: entry.previous_operational_status,
    new_operational_status: entry.new_operational_status,
    technical_outcome_snapshot: entry.technical_outcome_snapshot,
    administrative_closure_snapshot: entry.administrative_closure_snapshot,
    category_l1_label_snapshot: entry.category_l1_label_snapshot ?? null,
    category_l2_label_snapshot: entry.category_l2_label_snapshot ?? null,
    summary_note: entry.summary_note ?? null,
  });

  if (error) {
    console.error('Failed to append final_wo_history:', error.message);
  }
}

async function sendScopedNotifications(
  admin: SupabaseClient,
  params: {
    recipientIds: Array<string | null | undefined>;
    workOrderId: string;
    eventType: string;
    message: string;
    excludeUserId?: string;
  },
) {
  const uniqueIds = Array.from(
    new Set(
      params.recipientIds.filter(
        (id): id is string => Boolean(id) && id !== params.excludeUserId,
      ),
    ),
  );
  if (uniqueIds.length === 0) return;

  await admin.from('notifications').insert(
    uniqueIds.map((recipientId) => ({
      recipient_id: recipientId,
      work_order_id: params.workOrderId,
      event_type: params.eventType,
      message: params.message,
      destination_route: `ticket_fullview:${params.workOrderId}`,
      is_read: false,
    })),
  );
}

async function getDispatchIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'DISPATCH')
    .eq('is_active', true);
  return (data ?? []).map((r) => r.id as string);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // --------------------------------------------------------------------------
  // 1. PUBLIC CONFIG & ONE-TIME SUPER ADMIN BOOTSTRAP
  // --------------------------------------------------------------------------
  app.get('/api/config/public', async (_req, res) => {
    const missingEnv = getMissingEnv();
    const schema = missingEnv.length === 0 ? await checkSchemaReady() : { ready: false };
    res.json({
      configured: missingEnv.length === 0,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      missingEnv,
      schemaReady: schema.ready,
      schemaError: schema.error,
    });
  });

  // TEMPORARY SUPABASE AUTH API KEY DIAGNOSTIC
  app.get('/api/diagnostics/supabase-auth-key', async (_req, res) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(503).json({
        ok: false,
        diagnosis: 'MISSING_CONFIGURATION',
        message: 'Supabase URL atau API key belum tersedia di server.',
      });
    }

    try {
      const response = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: 'diagnostic-invalid@example.com',
            password: 'InvalidDiagnosticPassword123!',
          }),
        },
      );

      const result = await response.json().catch(() => ({}));
      const message = String(
        result.msg ||
        result.message ||
        result.error_description ||
        result.error ||
        ''
      );

      const invalidKey =
        response.status === 401 &&
        /invalid api key|invalid API key/i.test(message);

      return res.status(200).json({
        ok: !invalidKey && response.status !== 0,
        httpStatus: response.status,
        diagnosis: invalidKey
          ? 'API_KEY_REJECTED'
          : response.status === 400
            ? 'API_KEY_ACCEPTED_AUTH_REQUEST_REJECTED'
            : response.ok
              ? 'AUTH_REQUEST_ACCEPTED'
              : 'AUTH_ENDPOINT_RESPONDED',
        message: message || 'Supabase Auth memberikan respons.',
        projectHost: new URL(SUPABASE_URL).hostname,
        keyPrefix: SUPABASE_ANON_KEY.slice(0, 15),
        keyLength: SUPABASE_ANON_KEY.length,
      });
    } catch (error) {
      return res.status(200).json({
        ok: false,
        diagnosis: 'NETWORK_OR_URL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.get('/api/bootstrap/status', async (_req, res) => {
    const missingEnv = getMissingEnv();
    if (!supabaseAdmin || missingEnv.length > 0) {
      return res.json({
        configured: false,
        schemaReady: false,
        initialized: false,
        missingEnv,
      });
    }

    const { data: stateRow, error: stateErr } = await supabaseAdmin
      .from('bootstrap_state')
      .select('is_initialized, initialized_at')
      .eq('id', true)
      .maybeSingle();

    if (stateErr) {
      return res.json({
        configured: true,
        schemaReady: false,
        initialized: false,
        schemaError: stateErr.message,
      });
    }

    const { count: superAdminCount } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'SUPER_ADMIN');

    const initialized = Boolean(stateRow?.is_initialized) || (superAdminCount ?? 0) > 0;
    return res.json({
      configured: true,
      schemaReady: true,
      initialized,
      initializedAt: stateRow?.initialized_at ?? null,
    });
  });

  app.post('/api/bootstrap/super-admin', async (req, res) => {
    const admin = requireAdminClient(res);
    if (!admin) return;

    const { email, password, full_name, phone } = req.body as {
      email?: string;
      password?: string;
      full_name?: string;
      phone?: string;
    };

    if (!email || !password || !full_name) {
      return res
        .status(400)
        .json({ error: 'email, password, and full_name are required' });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 8 characters' });
    }

    // Strict one-time lock verification
    const { data: stateRow } = await admin
      .from('bootstrap_state')
      .select('is_initialized')
      .eq('id', true)
      .maybeSingle();

    const { count: superAdminCount } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'SUPER_ADMIN');

    if (stateRow?.is_initialized || (superAdminCount ?? 0) > 0) {
      return res.status(403).json({
        error: 'Initial Super Admin Bootstrap is permanently disabled.',
      });
    }

    const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), role: 'SUPER_ADMIN' },
    });

    if (authErr || !createdAuth.user) {
      return res
        .status(400)
        .json({ error: authErr?.message || 'Failed to create Auth user' });
    }

    const newUserId = createdAuth.user.id;
    const { error: profErr } = await admin.from('profiles').insert({
      id: newUserId,
      email: email.trim().toLowerCase(),
      full_name: full_name.trim(),
      phone: phone?.trim() || null,
      role: 'SUPER_ADMIN',
      vendor_id: null,
      area_ids: [],
      is_active: true,
      preferred_language: 'id',
    });

    if (profErr) {
      await admin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: profErr.message });
    }

    await admin
      .from('bootstrap_state')
      .update({
        is_initialized: true,
        initialized_by: newUserId,
        initialized_at: new Date().toISOString(),
      })
      .eq('id', true);

    await admin.from('audit_logs').insert({
      actor_id: newUserId,
      actor_role: 'SUPER_ADMIN',
      module_key: 'user_management',
      action: 'INITIAL_SUPER_ADMIN_BOOTSTRAP',
      target_id: newUserId,
      payload: { email: email.trim().toLowerCase() },
    });

    return res.status(201).json({
      success: true,
      message: 'Initial Super Admin created and bootstrap permanently locked.',
      userId: newUserId,
    });
  });

  // --------------------------------------------------------------------------
  // 2. SUPER ADMIN USER & MAPPING MANAGEMENT
  // --------------------------------------------------------------------------
  app.post(
    '/api/admin/users',
    requireRole(['SUPER_ADMIN']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const { email, password, full_name, phone, role, vendor_id, area_ids } =
        req.body as {
          email: string;
          password: string;
          full_name: string;
          phone?: string;
          role: UserRole;
          vendor_id?: string | null;
          area_ids?: string[];
        };

      if (!['SUPER_ADMIN', 'DISPATCH', 'LEADER', 'INSTALLER'].includes(role)) {
        return res.status(400).json({ error: 'Invalid NexusOps role' });
      }
      if ((role === 'LEADER' || role === 'INSTALLER') && !vendor_id) {
        return res
          .status(400)
          .json({ error: `${role} accounts must belong to a Contractor/Vendor` });
      }
      if (!email || !password || password.length < 8 || !full_name) {
        return res.status(400).json({
          error: 'Valid email, full_name, and password (>= 8 chars) are required',
        });
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim(), role },
      });

      if (createErr || !created.user) {
        return res
          .status(400)
          .json({ error: createErr?.message || 'Failed to create Auth user' });
      }

      const profileRow = {
        id: created.user.id,
        email: email.trim().toLowerCase(),
        full_name: full_name.trim(),
        phone: phone?.trim() || null,
        role,
        vendor_id: role === 'SUPER_ADMIN' || role === 'DISPATCH' ? null : vendor_id,
        area_ids: Array.isArray(area_ids) ? area_ids : [],
        is_active: true,
        preferred_language: 'id',
      };

      const { data: insertedProf, error: profErr } = await admin
        .from('profiles')
        .insert(profileRow)
        .select('*')
        .single();

      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return res.status(400).json({ error: profErr.message });
      }

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_role: caller.role,
        module_key: 'user_management',
        action: 'CREATE_USER',
        target_id: created.user.id,
        payload: { role, vendor_id: profileRow.vendor_id, email: profileRow.email },
      });

      return res.status(201).json({ user: insertedProf });
    },
  );

  app.patch(
    '/api/admin/users/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const targetId = req.params.id;
      const updates = req.body as Partial<UserProfile>;

      const allowedUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof updates.full_name === 'string') allowedUpdates.full_name = updates.full_name;
      if (typeof updates.phone !== 'undefined') allowedUpdates.phone = updates.phone;
      if (typeof updates.is_active === 'boolean') allowedUpdates.is_active = updates.is_active;
      if (typeof updates.vendor_id !== 'undefined') allowedUpdates.vendor_id = updates.vendor_id;
      if (Array.isArray(updates.area_ids)) allowedUpdates.area_ids = updates.area_ids;
      if (
        updates.role &&
        ['SUPER_ADMIN', 'DISPATCH', 'LEADER', 'INSTALLER'].includes(updates.role)
      ) {
        allowedUpdates.role = updates.role;
      }

      const { data, error } = await admin
        .from('profiles')
        .update(allowedUpdates)
        .eq('id', targetId)
        .select('*')
        .single();

      if (error) return res.status(400).json({ error: error.message });

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_role: caller.role,
        module_key: 'user_management',
        action: 'UPDATE_USER',
        target_id: targetId,
        payload: allowedUpdates,
      });

      return res.json({ user: data });
    },
  );

  // OBD-02: Active WO remapping protection when Vendor/Leader mapping changes
  app.post(
    '/api/admin/mappings/remap-check',
    requireRole(['SUPER_ADMIN']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const { vendor_id } = req.body as { vendor_id: string };
      if (!vendor_id) return res.status(400).json({ error: 'vendor_id is required' });

      const { data: activeWOs } = await admin
        .from('work_orders')
        .select('*')
        .eq('vendor_id', vendor_id)
        .neq('administrative_closure', 'CLOSED');

      const affected = (activeWOs ?? []) as Array<{
        id: string;
        wo_number: string;
        operational_status: string;
        technical_outcome: string | null;
        administrative_closure: string;
        assigned_installer_id: string | null;
      }>;

      for (const wo of affected) {
        // Strictly preserve assigned_installer_id, check_in_at, LiveChat, Evidence, and Reports
        await admin
          .from('work_orders')
          .update({
            active_wo_remapped_pending: true,
            grouping_exception: 'ACTIVE_WO_REMAPPED_PENDING',
            updated_at: new Date().toISOString(),
          })
          .eq('id', wo.id);

        await appendFinalHistory(admin, {
          work_order_id: wo.id,
          wo_number: wo.wo_number,
          event_type: 'ACTIVE_WO_REMAPPED_PENDING',
          actor_id: caller.id,
          actor_role: caller.role,
          previous_operational_status: wo.operational_status,
          new_operational_status: wo.operational_status,
          technical_outcome_snapshot: wo.technical_outcome,
          administrative_closure_snapshot: wo.administrative_closure,
          summary_note:
            'Vendor/Leader mapping changed on active WO. assignedInstallerId and field progress preserved.',
        });
      }

      return res.json({ flaggedCount: affected.length });
    },
  );

  // --------------------------------------------------------------------------
  // 3. LEADER: ADD INSTALLER USER (STRICTLY LOCKED TO LEADER VENDOR SCOPE)
  // --------------------------------------------------------------------------
  app.post(
    '/api/leader/installers',
    requireRole(['LEADER']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      if (!caller.vendor_id) {
        return res.status(403).json({
          error: 'Leader profile does not have an assigned Contractor/Vendor scope',
        });
      }

      const { email, password, full_name, phone, area_ids } = req.body as {
        email: string;
        password: string;
        full_name: string;
        phone?: string;
        area_ids?: string[];
      };

      if (!email || !password || password.length < 8 || !full_name) {
        return res.status(400).json({
          error: 'Valid email, full_name, and password (>= 8 chars) are required',
        });
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
          role: 'INSTALLER',
          vendor_id: caller.vendor_id,
        },
      });

      if (createErr || !created.user) {
        return res
          .status(400)
          .json({ error: createErr?.message || 'Failed to create Installer account' });
      }

      // Strictly lock role = INSTALLER and vendor_id = caller.vendor_id
      const { data: profile, error: profErr } = await admin
        .from('profiles')
        .insert({
          id: created.user.id,
          email: email.trim().toLowerCase(),
          full_name: full_name.trim(),
          phone: phone?.trim() || null,
          role: 'INSTALLER',
          vendor_id: caller.vendor_id,
          area_ids: Array.isArray(area_ids) ? area_ids : [],
          is_active: true,
          preferred_language: 'id',
        })
        .select('*')
        .single();

      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return res.status(400).json({ error: profErr.message });
      }

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_role: caller.role,
        module_key: 'installer_team',
        action: 'LEADER_ADD_INSTALLER',
        target_id: created.user.id,
        payload: { vendor_id: caller.vendor_id, email: email.trim().toLowerCase() },
      });

      return res.status(201).json({ user: profile });
    },
  );

  // --------------------------------------------------------------------------
  // 4. DISPATCH: IMPORT EXECUTION + 8-CASE AUTOMATIC VENDOR GROUPING
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/import',
    requireRole(['DISPATCH']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const payload = req.body as ExecuteImportPayload;

      if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) {
        return res.status(400).json({ error: 'Import rows are required' });
      }

      // Load master reference tables for deterministic 8-case grouping
      const [vendorsRes, areasRes, mappingsRes, leadersRes, existingWoRes] =
        await Promise.all([
          admin.from('vendors').select('*'),
          admin.from('areas').select('*'),
          admin.from('leader_vendor_mappings').select('*'),
          admin.from('profiles').select('*').eq('role', 'LEADER'),
          admin.from('work_orders').select('wo_number'),
        ]);

      const vendors = (vendorsRes.data ?? []) as Vendor[];
      const areas = (areasRes.data ?? []) as Area[];
      const mappings = (mappingsRes.data ?? []) as LeaderVendorMapping[];
      const leaders = (leadersRes.data ?? []) as UserProfile[];
      const existingWoSet = new Set(
        (existingWoRes.data ?? []).map((w) => String(w.wo_number).toUpperCase()),
      );

      let validCount = 0;
      let invalidCount = 0;
      let duplicateCount = 0;

      const batchCode = `IMP-${Date.now()}`;
      const { data: batch, error: batchErr } = await admin
        .from('import_batches')
        .insert({
          batch_code: batchCode,
          source_type: payload.source_type,
          file_name: payload.file_name || null,
          total_rows: payload.rows.length,
          column_mapping: payload.column_mapping || {},
          imported_by: caller.id,
          status: 'PROCESSING',
        })
        .select('*')
        .single();

      if (batchErr || !batch) {
        return res.status(500).json({ error: batchErr?.message || 'Batch insert failed' });
      }

      const createdWorkOrders: Array<{ id: string; wo_number: string; leader_id: string | null }> = [];
      const seenBatchWo = new Set<string>();

      for (const row of payload.rows) {
        const woNum = (row.mapped?.wo_number || '').trim();
        const normalizedWo = woNum.toUpperCase();
        let status = row.validation_status;
        const errors = [...(row.errors || [])];

        if (status === 'VALID') {
          if (!woNum || !row.mapped.customer_name || !row.mapped.address_line) {
            status = 'INVALID';
            errors.push('Missing mandatory fields');
          } else if (existingWoSet.has(normalizedWo) || seenBatchWo.has(normalizedWo)) {
            status = 'DUPLICATE';
            errors.push(`Duplicate WO Number: ${woNum}`);
          }
        }

        if (status === 'DUPLICATE') {
          duplicateCount++;
          await admin.from('import_batch_rows').insert({
            batch_id: batch.id,
            row_index: row.row_index,
            raw_payload: row.raw_payload,
            validation_status: 'DUPLICATE',
            errors,
          });
          continue;
        }

        if (status === 'INVALID') {
          invalidCount++;
          await admin.from('import_batch_rows').insert({
            batch_id: batch.id,
            row_index: row.row_index,
            raw_payload: row.raw_payload,
            validation_status: 'INVALID',
            errors,
          });
          continue;
        }

        seenBatchWo.add(normalizedWo);
        existingWoSet.add(normalizedWo);
        validCount++;

        const grouping = evaluateDeterministicVendorGrouping({
          rawVendorName: row.mapped.raw_vendor_name,
          rawAreaName: row.mapped.raw_area_name,
          vendors,
          areas,
          mappings,
          leaders,
        });

        const { data: insertedWO, error: woErr } = await admin
          .from('work_orders')
          .insert({
            wo_number: woNum,
            import_batch_id: batch.id,
            original_import_payload: row.raw_payload,
            customer_name: row.mapped.customer_name,
            customer_phone: row.mapped.customer_phone || null,
            customer_id_ref: row.mapped.customer_id_ref || null,
            service_type: row.mapped.service_type || null,
            appointment_date: row.mapped.appointment_date || null,
            appointment_slot: row.mapped.appointment_slot || null,
            network_odp: row.mapped.network_odp || null,
            network_ont_sn: row.mapped.network_ont_sn || null,
            network_vlan: row.mapped.network_vlan || null,
            address_line: row.mapped.address_line,
            district: row.mapped.district || null,
            city: row.mapped.city || null,
            raw_vendor_name: row.mapped.raw_vendor_name,
            vendor_id: grouping.vendorId,
            raw_area_name: row.mapped.raw_area_name,
            area_id: grouping.areaId,
            grouping_case: grouping.groupingCase,
            grouping_exception: grouping.groupingException,
            leader_id: grouping.leaderId,
            operational_status: grouping.operationalStatus,
            administrative_closure: 'OPEN_HOLD',
          })
          .select('id, wo_number, leader_id')
          .single();

        if (woErr || !insertedWO) {
          invalidCount++;
          validCount--;
          await admin.from('import_batch_rows').insert({
            batch_id: batch.id,
            row_index: row.row_index,
            raw_payload: row.raw_payload,
            validation_status: 'INVALID',
            errors: [woErr?.message || 'Insert failed'],
          });
          continue;
        }

        createdWorkOrders.push(insertedWO);

        await admin.from('import_batch_rows').insert({
          batch_id: batch.id,
          row_index: row.row_index,
          raw_payload: row.raw_payload,
          validation_status: 'VALID',
          errors: [],
          work_order_id: insertedWO.id,
        });

        await appendFinalHistory(admin, {
          work_order_id: insertedWO.id,
          wo_number: insertedWO.wo_number,
          event_type: 'WO_IMPORTED_AND_GROUPED',
          actor_id: caller.id,
          actor_role: caller.role,
          previous_operational_status: null,
          new_operational_status: grouping.operationalStatus,
          technical_outcome_snapshot: null,
          administrative_closure_snapshot: 'OPEN_HOLD',
          summary_note: `Batch ${batchCode} · Grouping ${grouping.groupingCase}${
            grouping.groupingException ? ` (${grouping.groupingException})` : ''
          }`,
        });

        if (grouping.leaderId) {
          await sendScopedNotifications(admin, {
            recipientIds: [grouping.leaderId],
            workOrderId: insertedWO.id,
            eventType: 'WO_GROUPED_TO_QUEUE',
            message: `WO ${insertedWO.wo_number} grouped to your Vendor queue.`,
          });
        }
      }

      const { data: finalizedBatch } = await admin
        .from('import_batches')
        .update({
          valid_rows: validCount,
          invalid_rows: invalidCount,
          duplicate_rows: duplicateCount,
          status: 'COMPLETED',
        })
        .eq('id', batch.id)
        .select('*')
        .single();

      return res.status(201).json({
        batch: finalizedBatch || batch,
        createdCount: createdWorkOrders.length,
      });
    },
  );

  // --------------------------------------------------------------------------
  // 5. LEADER: ASSIGN & REASSIGN INSTALLER (PRESERVES ALL HISTORY)
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/:id/assign',
    requireRole(['LEADER']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const woId = req.params.id;
      const { installer_id, reason } = req.body as {
        installer_id?: string;
        reason?: string;
      };

      if (!installer_id) {
        return res.status(400).json({ error: 'installer_id is required' });
      }

      const { data: wo, error: woErr } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();

      if (woErr || !wo) return res.status(404).json({ error: 'Work Order not found' });
      if (!caller.vendor_id || wo.vendor_id !== caller.vendor_id) {
        return res
          .status(403)
          .json({ error: 'Work Order is outside your authorized Vendor scope' });
      }

      const { data: installer, error: instErr } = await admin
        .from('profiles')
        .select('*')
        .eq('id', installer_id)
        .single();

      if (instErr || !installer) {
        return res.status(404).json({ error: 'Installer account not found' });
      }
      if (installer.role !== 'INSTALLER') {
        return res.status(400).json({ error: 'Selected user is not an INSTALLER' });
      }
      if (!installer.is_active) {
        return res
          .status(400)
          .json({ error: 'Inactive Installer cannot receive new assignments' });
      }
      if (installer.vendor_id !== wo.vendor_id) {
        return res
          .status(403)
          .json({ error: 'Installer belongs to a different Contractor/Vendor' });
      }
      if (
        wo.area_id &&
        Array.isArray(installer.area_ids) &&
        installer.area_ids.length > 0 &&
        !installer.area_ids.includes(wo.area_id)
      ) {
        return res
          .status(400)
          .json({ error: 'Installer does not cover the Work Order Area' });
      }

      const isReassign = Boolean(wo.assigned_installer_id);
      const previousInstallerId = wo.assigned_installer_id as string | null;

      if (isReassign && previousInstallerId === installer_id) {
        return res
          .status(400)
          .json({ error: 'Installer is already assigned to this Work Order' });
      }

      const { data: lastSegment } = await admin
        .from('wo_assignments')
        .select('session_segment_no')
        .eq('work_order_id', woId)
        .order('session_segment_no', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSegment = ((lastSegment?.session_segment_no as number | undefined) ?? 0) + 1;

      if (isReassign) {
        await admin
          .from('wo_assignments')
          .update({
            is_active_segment: false,
            archived_at: new Date().toISOString(),
          })
          .eq('work_order_id', woId)
          .eq('is_active_segment', true);
      }

      await admin.from('wo_assignments').insert({
        work_order_id: woId,
        session_segment_no: nextSegment,
        action_type: isReassign ? 'REASSIGN' : 'ASSIGN',
        previous_installer_id: previousInstallerId,
        new_installer_id: installer_id,
        assigned_by: caller.id,
        reason: reason?.trim() || null,
        is_active_segment: true,
      });

      const preserveStatus = [
        'IN_PROGRESS',
        'REPORT_SUBMITTED',
        'REVISION_ACTIVE',
        'REJECTED_FOLLOWUP_ACTIVE',
      ].includes(wo.operational_status);

      const nextOperationalStatus = preserveStatus
        ? wo.operational_status
        : 'ASSIGNED';

      await admin
        .from('work_orders')
        .update({
          assigned_installer_id: installer_id,
          assigned_at: new Date().toISOString(),
          operational_status: nextOperationalStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', woId);

      await appendFinalHistory(admin, {
        work_order_id: woId,
        wo_number: wo.wo_number,
        event_type: isReassign ? 'WO_REASSIGNED' : 'WO_ASSIGNED',
        actor_id: caller.id,
        actor_role: caller.role,
        previous_operational_status: wo.operational_status,
        new_operational_status: nextOperationalStatus,
        technical_outcome_snapshot: wo.technical_outcome,
        administrative_closure_snapshot: wo.administrative_closure,
        summary_note: `${isReassign ? 'Reassigned' : 'Assigned'} to ${installer.full_name}${
          reason ? ` — ${reason}` : ''
        }`,
      });

      const dispatchIds = await getDispatchIds(admin);
      await sendScopedNotifications(admin, {
        recipientIds: [installer_id, previousInstallerId, ...dispatchIds],
        workOrderId: woId,
        eventType: isReassign ? 'WO_REASSIGNED' : 'WO_ASSIGNED',
        message: isReassign
          ? `WO ${wo.wo_number} reassigned to ${installer.full_name}.`
          : `WO ${wo.wo_number} assigned to ${installer.full_name}.`,
        excludeUserId: caller.id,
      });

      return res.json({ success: true, action: isReassign ? 'REASSIGN' : 'ASSIGN' });
    },
  );

  // --------------------------------------------------------------------------
  // 6. LIVECHAT & PROGRESS CHECK-IN (LEADER BLOCKED PER OBD-06)
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/:id/chat',
    requireRole(['INSTALLER', 'DISPATCH', 'SUPER_ADMIN']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const woId = req.params.id;
      const { category, content, attachment_id } = req.body as {
        category: ChatCategory;
        content: string;
        attachment_id?: string | null;
      };

      if (!['PROGRESS', 'ISSUE', 'REQUEST', 'GENERAL'].includes(category)) {
        return res.status(400).json({ error: 'Invalid LiveChat category' });
      }
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content cannot be empty' });
      }

      const { data: wo, error: woErr } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();

      if (woErr || !wo) return res.status(404).json({ error: 'Work Order not found' });
      if (caller.role === 'INSTALLER' && wo.assigned_installer_id !== caller.id) {
        return res
          .status(403)
          .json({ error: 'Only the currently assigned Installer can post to this WO' });
      }

      const isFirstProgressCheckIn =
        caller.role === 'INSTALLER' && category === 'PROGRESS' && !wo.check_in_at;

      const { data: msg, error: msgErr } = await admin
        .from('wo_chat_messages')
        .insert({
          work_order_id: woId,
          sender_id: caller.id,
          sender_role: caller.role,
          category,
          content: content.trim(),
          attachment_id: attachment_id || null,
          triggered_check_in: isFirstProgressCheckIn,
          metadata: {},
        })
        .select('*')
        .single();

      if (msgErr || !msg) {
        return res.status(500).json({ error: msgErr?.message || 'Failed to save message' });
      }

      if (isFirstProgressCheckIn) {
        const checkInTs = msg.created_at || new Date().toISOString();
        const nextStatus =
          wo.operational_status === 'REVISION_ACTIVE' ? 'REVISION_ACTIVE' : 'IN_PROGRESS';

        await admin
          .from('work_orders')
          .update({
            check_in_at: checkInTs,
            check_in_message_id: msg.id,
            operational_status: nextStatus,
            progress_summary: content.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', woId);

        await appendFinalHistory(admin, {
          work_order_id: woId,
          wo_number: wo.wo_number,
          event_type: 'CHECK_IN_VIA_PROGRESS',
          actor_id: caller.id,
          actor_role: caller.role,
          previous_operational_status: wo.operational_status,
          new_operational_status: nextStatus,
          technical_outcome_snapshot: wo.technical_outcome,
          administrative_closure_snapshot: wo.administrative_closure,
          summary_note: `Check-in triggered by first PROGRESS message: "${content.trim().slice(0, 120)}"`,
        });
      } else if (category === 'PROGRESS' && caller.role === 'INSTALLER') {
        await admin
          .from('work_orders')
          .update({
            progress_summary: content.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', woId);
      }

      const dispatchIds = await getDispatchIds(admin);
      await sendScopedNotifications(admin, {
        recipientIds: [wo.leader_id, wo.assigned_installer_id, ...dispatchIds],
        workOrderId: woId,
        eventType: isFirstProgressCheckIn ? 'PROGRESS_CHECK_IN' : 'LIVECHAT_MESSAGE',
        message: isFirstProgressCheckIn
          ? `Installer checked in via PROGRESS on WO ${wo.wo_number}.`
          : `New ${category} LiveChat message on WO ${wo.wo_number}.`,
        excludeUserId: caller.id,
      });

      return res.status(201).json({
        message: msg,
        triggeredCheckIn: isFirstProgressCheckIn,
      });
    },
  );

  // --------------------------------------------------------------------------
  // 7. MATERIAL REQUESTS (INSTALLER CREATES; DISPATCH APPROVES/REJECTS PER OBD-05)
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/:id/material-requests',
    requireRole(['INSTALLER']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const woId = req.params.id;
      const payload = req.body as SubmitMaterialRequestPayload;

      if (!payload.item_name || !payload.quantity || payload.quantity <= 0 || !payload.unit) {
        return res
          .status(400)
          .json({ error: 'item_name, positive quantity, and unit are required' });
      }

      const { data: wo } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();
      if (!wo || wo.assigned_installer_id !== caller.id) {
        return res.status(403).json({ error: 'Work Order not assigned to you' });
      }

      const { data: created, error } = await admin
        .from('material_requests')
        .insert({
          work_order_id: woId,
          requester_id: caller.id,
          item_name: payload.item_name.trim(),
          quantity: payload.quantity,
          unit: payload.unit.trim(),
          description: payload.description?.trim() || null,
          attachment_id: payload.attachment_id || null,
          status: 'REQUESTED',
        })
        .select('*')
        .single();

      if (error) return res.status(400).json({ error: error.message });

      await appendFinalHistory(admin, {
        work_order_id: woId,
        wo_number: wo.wo_number,
        event_type: 'MATERIAL_REQUEST_SUBMITTED',
        actor_id: caller.id,
        actor_role: caller.role,
        previous_operational_status: wo.operational_status,
        new_operational_status: wo.operational_status,
        technical_outcome_snapshot: wo.technical_outcome,
        administrative_closure_snapshot: wo.administrative_closure,
        summary_note: `Material requested: ${payload.item_name} (${payload.quantity} ${payload.unit})`,
      });

      const dispatchIds = await getDispatchIds(admin);
      await sendScopedNotifications(admin, {
        recipientIds: [wo.leader_id, ...dispatchIds],
        workOrderId: woId,
        eventType: 'MATERIAL_REQUEST_SUBMITTED',
        message: `Material request (${payload.item_name}) submitted for WO ${wo.wo_number}.`,
        excludeUserId: caller.id,
      });

      return res.status(201).json({ materialRequest: created });
    },
  );

  app.post(
    '/api/work-orders/:id/material-requests/:reqId/decision',
    requireRole(['DISPATCH']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const { id: woId, reqId } = req.params;
      const { decision, review_note } = req.body as {
        decision: 'APPROVED' | 'REJECTED';
        review_note?: string;
      };

      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED' });
      }

      const { data: wo } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();
      if (!wo) return res.status(404).json({ error: 'Work Order not found' });

      const { data: updated, error } = await admin
        .from('material_requests')
        .update({
          status: decision,
          reviewed_by: caller.id,
          review_note: review_note?.trim() || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reqId)
        .eq('work_order_id', woId)
        .select('*')
        .single();

      if (error || !updated) {
        return res.status(404).json({ error: 'Material Request not found' });
      }

      await appendFinalHistory(admin, {
        work_order_id: woId,
        wo_number: wo.wo_number,
        event_type: `MATERIAL_REQUEST_${decision}`,
        actor_id: caller.id,
        actor_role: caller.role,
        previous_operational_status: wo.operational_status,
        new_operational_status: wo.operational_status,
        technical_outcome_snapshot: wo.technical_outcome,
        administrative_closure_snapshot: wo.administrative_closure,
        summary_note: `Material "${updated.item_name}" ${decision} by Dispatch${
          review_note ? ` — ${review_note}` : ''
        }`,
      });

      await sendScopedNotifications(admin, {
        recipientIds: [updated.requester_id, wo.leader_id],
        workOrderId: woId,
        eventType: 'MATERIAL_REQUEST_DECIDED',
        message: `Material request "${updated.item_name}" on WO ${wo.wo_number} was ${decision}.`,
        excludeUserId: caller.id,
      });

      return res.json({ materialRequest: updated });
    },
  );

  // --------------------------------------------------------------------------
  // 8. INSTALLER TECHNICAL REPORT & CHECK-OUT SNAPSHOT
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/:id/report',
    requireRole(['INSTALLER']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const woId = req.params.id;
      const payload = req.body as SubmitReportPayload;

      const { data: wo, error: woErr } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();

      if (woErr || !wo) return res.status(404).json({ error: 'Work Order not found' });
      if (wo.assigned_installer_id !== caller.id) {
        return res.status(403).json({ error: 'Work Order is not assigned to you' });
      }

      // Mandatory Check-in gate before report submission
      if (!wo.check_in_at) {
        return res.status(400).json({
          code: 'CHECK_IN_REQUIRED',
          error:
            'Valid Check-in via PROGRESS LiveChat message is required before submitting Report.',
        });
      }

      if (
        !payload.report_l1_code ||
        !payload.report_l2_code ||
        !payload.technical_findings?.trim() ||
        !payload.work_description?.trim()
      ) {
        return res.status(400).json({
          error:
            'Report Level 1, Report Level 2, Technical Findings, and Work Description are required',
        });
      }

      const { data: lastRep } = await admin
        .from('wo_reports')
        .select('revision_no')
        .eq('work_order_id', woId)
        .order('revision_no', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextRev = ((lastRep?.revision_no as number | undefined) ?? 0) + 1;
      const checkOutTs = new Date().toISOString();

      const { data: report, error: repErr } = await admin
        .from('wo_reports')
        .insert({
          work_order_id: woId,
          installer_id: caller.id,
          revision_no: nextRev,
          report_l1_code: payload.report_l1_code,
          report_l1_label: payload.report_l1_label,
          report_l2_code: payload.report_l2_code,
          report_l2_label: payload.report_l2_label,
          technical_findings: payload.technical_findings.trim(),
          work_description: payload.work_description.trim(),
          additional_notes: payload.additional_notes?.trim() || null,
          technical_measurements: payload.technical_measurements || {},
          evidence_attachment_ids: payload.evidence_attachment_ids || [],
          check_in_at_snapshot: wo.check_in_at,
          check_out_at: checkOutTs,
          submitted_at: checkOutTs,
        })
        .select('*')
        .single();

      if (repErr || !report) {
        return res.status(500).json({ error: repErr?.message || 'Failed to save Report' });
      }

      // Check-out never overwrites check_in_at
      await admin
        .from('work_orders')
        .update({
          latest_check_out_at: checkOutTs,
          operational_status: 'REPORT_SUBMITTED',
          progress_percent: 100,
          updated_at: checkOutTs,
        })
        .eq('id', woId);

      await appendFinalHistory(admin, {
        work_order_id: woId,
        wo_number: wo.wo_number,
        event_type: nextRev > 1 ? 'REPORT_REVISION_SUBMITTED' : 'REPORT_SUBMITTED_CHECKOUT',
        actor_id: caller.id,
        actor_role: caller.role,
        previous_operational_status: wo.operational_status,
        new_operational_status: 'REPORT_SUBMITTED',
        technical_outcome_snapshot: wo.technical_outcome,
        administrative_closure_snapshot: wo.administrative_closure,
        category_l1_label_snapshot: payload.report_l1_label,
        category_l2_label_snapshot: payload.report_l2_label,
        summary_note: `Report v${nextRev} submitted with Check-out snapshot.`,
      });

      const dispatchIds = await getDispatchIds(admin);
      await sendScopedNotifications(admin, {
        recipientIds: [wo.leader_id, ...dispatchIds],
        workOrderId: woId,
        eventType: 'REPORT_SUBMITTED',
        message: `Technical Report v${nextRev} submitted for WO ${wo.wo_number} (Check-out recorded).`,
        excludeUserId: caller.id,
      });

      return res.status(201).json({ report });
    },
  );

  // --------------------------------------------------------------------------
  // 9. DISPATCH REVIEW (EXCLUSIVE TO DISPATCH)
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/:id/review',
    requireRole(['DISPATCH']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const woId = req.params.id;
      const payload = req.body as ReviewReportPayload;

      if (!['APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'].includes(payload.decision)) {
        return res.status(400).json({ error: 'Invalid review decision' });
      }
      if (!payload.review_notes?.trim()) {
        return res.status(400).json({ error: 'Review notes are required' });
      }

      const { data: wo } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();
      if (!wo) return res.status(404).json({ error: 'Work Order not found' });

      const { data: review, error: revErr } = await admin
        .from('wo_reviews')
        .insert({
          work_order_id: woId,
          report_id: payload.report_id,
          reviewer_id: caller.id,
          decision: payload.decision,
          review_notes: payload.review_notes.trim(),
        })
        .select('*')
        .single();

      if (revErr) return res.status(400).json({ error: revErr.message });

      const nextStatus =
        payload.decision === 'APPROVED'
          ? 'APPROVED_READY_CLOSING'
          : payload.decision === 'RETURNED_FOR_REVISION'
            ? 'REVISION_ACTIVE'
            : 'REJECTED_FOLLOWUP_ACTIVE';

      await admin
        .from('work_orders')
        .update({
          latest_review_decision: payload.decision,
          operational_status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', woId);

      await appendFinalHistory(admin, {
        work_order_id: woId,
        wo_number: wo.wo_number,
        event_type: `DISPATCH_REVIEW_${payload.decision}`,
        actor_id: caller.id,
        actor_role: caller.role,
        previous_operational_status: wo.operational_status,
        new_operational_status: nextStatus,
        technical_outcome_snapshot: wo.technical_outcome,
        administrative_closure_snapshot: wo.administrative_closure,
        summary_note: payload.review_notes.trim(),
      });

      const notifEvent =
        payload.decision === 'APPROVED'
          ? 'REPORT_APPROVED'
          : payload.decision === 'REJECTED'
            ? 'REPORT_REJECTED'
            : 'REPORT_RETURNED';

      await sendScopedNotifications(admin, {
        recipientIds: [wo.assigned_installer_id, wo.leader_id],
        workOrderId: woId,
        eventType: notifEvent,
        message: `Dispatch Review on WO ${wo.wo_number}: ${payload.decision} — ${payload.review_notes.trim()}`,
        excludeUserId: caller.id,
      });

      return res.status(201).json({ review });
    },
  );

  // --------------------------------------------------------------------------
  // 10. DISPATCH FINAL CLOSING (4x3 MATRIX + OBD-01 OPEN_RESCHEDULE / OPEN_PENDING)
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/:id/close',
    requireRole(['DISPATCH']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const woId = req.params.id;
      const payload = req.body as FinalClosePayload;

      const { data: wo } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();
      if (!wo) return res.status(404).json({ error: 'Work Order not found' });

      if (wo.latest_review_decision !== 'APPROVED') {
        return res.status(400).json({
          error: 'Report must be APPROVED by Dispatch before Final Closing.',
        });
      }

      // Enforce OBD-01 & 4x3 Matrix Separation
      let resolvedAdminClosure = payload.administrative_closure;
      let resolvedOpStatus = payload.operational_status;
      if (payload.technical_outcome === 'RESCHEDULE') {
        resolvedAdminClosure = 'OPEN_HOLD';
        resolvedOpStatus = 'OPEN_RESCHEDULE';
      } else if (payload.technical_outcome === 'PENDING_FOLLOWUP') {
        resolvedAdminClosure = 'OPEN_HOLD';
        resolvedOpStatus = 'OPEN_PENDING';
      }

      const nowTs = new Date().toISOString();
      const { data: updatedWO, error: updErr } = await admin
        .from('work_orders')
        .update({
          technical_outcome: payload.technical_outcome,
          administrative_closure: resolvedAdminClosure,
          operational_status: resolvedOpStatus,
          closing_l1_label: payload.closing_l1_label,
          closing_l2_label: payload.closing_l2_label,
          closed_at: resolvedAdminClosure === 'CLOSED' ? nowTs : null,
          closed_by: caller.id,
          active_wo_remapped_pending: false,
          updated_at: nowTs,
        })
        .eq('id', woId)
        .select('*')
        .single();

      if (updErr) return res.status(400).json({ error: updErr.message });

      await appendFinalHistory(admin, {
        work_order_id: woId,
        wo_number: wo.wo_number,
        event_type: 'FINAL_CLOSING_EXECUTED',
        actor_id: caller.id,
        actor_role: caller.role,
        previous_operational_status: wo.operational_status,
        new_operational_status: resolvedOpStatus,
        technical_outcome_snapshot: payload.technical_outcome,
        administrative_closure_snapshot: resolvedAdminClosure,
        category_l1_label_snapshot: payload.closing_l1_label,
        category_l2_label_snapshot: payload.closing_l2_label,
        summary_note: payload.closing_notes || null,
      });

      await sendScopedNotifications(admin, {
        recipientIds: [wo.assigned_installer_id, wo.leader_id],
        workOrderId: woId,
        eventType: 'FINAL_CLOSING_COMPLETED',
        message: `Final Closing on WO ${wo.wo_number}: ${resolvedOpStatus} (${payload.closing_l1_label} / ${payload.closing_l2_label}).`,
        excludeUserId: caller.id,
      });

      return res.json({ workOrder: updatedWO });
    },
  );

  // --------------------------------------------------------------------------
  // 11. ISSUES & ESCALATION (SECTION 15)
  // --------------------------------------------------------------------------
  app.post(
    '/api/work-orders/:id/issues',
    requireRole(['INSTALLER', 'DISPATCH']),
    async (req: AuthedRequest, res) => {
      const admin = requireAdminClient(res)!;
      const caller = req.caller!;
      const woId = req.params.id;
      const { severity, title, description } = req.body as {
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        title: string;
        description: string;
      };

      const { data: wo } = await admin
        .from('work_orders')
        .select('*')
        .eq('id', woId)
        .single();
      if (!wo) return res.status(404).json({ error: 'Work Order not found' });

      const { data: issue, error } = await admin
        .from('wo_issues')
        .insert({
          work_order_id: woId,
          reported_by: caller.id,
          severity: severity || 'MEDIUM',
          title: title.trim(),
          description: description.trim(),
          status: severity === 'CRITICAL' ? 'ESCALATED' : 'OPEN',
        })
        .select('*')
        .single();

      if (error) return res.status(400).json({ error: error.message });

      await appendFinalHistory(admin, {
        work_order_id: woId,
        wo_number: wo.wo_number,
        event_type: 'ISSUE_ESCALATION_CREATED',
        actor_id: caller.id,
        actor_role: caller.role,
        previous_operational_status: wo.operational_status,
        new_operational_status: wo.operational_status,
        technical_outcome_snapshot: wo.technical_outcome,
        administrative_closure_snapshot: wo.administrative_closure,
        summary_note: `[${severity}] ${title.trim()}`,
      });

      const dispatchIds = await getDispatchIds(admin);
      await sendScopedNotifications(admin, {
        recipientIds: [wo.leader_id, ...dispatchIds],
        workOrderId: woId,
        eventType: 'ISSUE_CREATED',
        message: `Issue [${severity}] reported on WO ${wo.wo_number}: ${title.trim()}`,
        excludeUserId: caller.id,
      });

      return res.status(201).json({ issue });
    },
  );

  // --------------------------------------------------------------------------
  // VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD)
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexusOps server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NexusOps server:', err);
  process.exit(1);
});
