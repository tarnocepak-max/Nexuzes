import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  Settings,
  UserPlus,
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { getSupabaseClient } from '../lib/supabase';
import { NexusService } from '../services/nexusService';
import {
  ROLE_META,
  SUPER_ADMIN_CONFIG_MODULES,
  type AuditLogItem,
  type UserRole,
} from '../types/nexusops';

/* ============================================================================
 * 1. MANAGEMENT STAFF VIEW (Super Admin CRUD + Leader Add Installer User)
 * ========================================================================== */
export const ManagementStaffView: React.FC = () => {
  const {
    profile,
    t,
    vendors,
    areas,
    profiles,
    mappings,
    refreshAllData,
  } = useNexus();

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // User form (Super Admin full / Leader Installer-only)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('INSTALLER');
  const [vendorId, setVendorId] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // Vendor & Area & Mapping creation (Super Admin only)
  const [vendorCode, setVendorCode] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [areaName, setAreaName] = useState('');
  const [mapVendorId, setMapVendorId] = useState('');
  const [mapAreaId, setMapAreaId] = useState('');
  const [mapLeaderId, setMapLeaderId] = useState('');

  if (!profile) return null;

  const isSuperAdmin = profile.role === 'SUPER_ADMIN';
  const isLeader = profile.role === 'LEADER';

  const visibleProfiles = isLeader
    ? profiles.filter(
        (p) => p.vendor_id === profile.vendor_id && p.role === 'INSTALLER',
      )
    : profiles;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (isLeader) {
        await NexusService.leaderCreateInstaller({
          email,
          password,
          full_name: fullName,
          phone: phone || undefined,
          area_ids: selectedAreas,
        });
        setMsg('New Installer account created inside your Vendor scope.');
      } else if (isSuperAdmin) {
        await NexusService.adminCreateUser({
          email,
          password,
          full_name: fullName,
          phone: phone || undefined,
          role,
          vendor_id:
            role === 'LEADER' || role === 'INSTALLER' ? vendorId || null : null,
          area_ids: selectedAreas,
        });
        setMsg(`User (${role}) created successfully.`);
      }
      setEmail('');
      setPassword('');
      setFullName('');
      setPhone('');
      setSelectedAreas([]);
      await refreshAllData();
    } catch (eObj) {
      setErr(eObj instanceof Error ? eObj.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUserActive = async (targetId: string, current: boolean) => {
    setBusy(true);
    try {
      await NexusService.adminUpdateUser(targetId, { is_active: !current });
      await refreshAllData();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase
        .from('vendors')
        .insert({ code: vendorCode.trim().toUpperCase(), name: vendorName.trim() });
      if (error) throw error;
      setVendorCode('');
      setVendorName('');
      await refreshAllData();
    } catch (eObj) {
      setErr(eObj instanceof Error ? eObj.message : 'Failed to add vendor');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase
        .from('areas')
        .insert({ code: areaCode.trim().toUpperCase(), name: areaName.trim() });
      if (error) throw error;
      setAreaCode('');
      setAreaName('');
      await refreshAllData();
    } catch (eObj) {
      setErr(eObj instanceof Error ? eObj.message : 'Failed to add area');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = await getSupabaseClient();
    if (!supabase || !mapVendorId || !mapLeaderId) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from('leader_vendor_mappings').insert({
        vendor_id: mapVendorId,
        area_id: mapAreaId || null,
        leader_id: mapLeaderId,
        is_active: true,
      });
      if (error) throw error;
      const remap = await NexusService.triggerRemapCheck(mapVendorId);
      setMsg(
        `Leader-to-Vendor mapping saved.${
          remap.flaggedCount > 0
            ? ` ${remap.flaggedCount} active WOs flagged ACTIVE_WO_REMAPPED_PENDING (installers preserved).`
            : ''
        }`,
      );
      await refreshAllData();
    } catch (eObj) {
      setErr(eObj instanceof Error ? eObj.message : 'Failed to create mapping');
    } finally {
      setBusy(false);
    }
  };

  const toggleAreaSelection = (id: string) => {
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6">
      {err && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {err}
        </div>
      )}
      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {msg}
        </div>
      )}

      {/* User / Installer Creation Card */}
      {(isSuperAdmin || isLeader) && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#7C3AED]" />
            <h2 className="font-display font-semibold text-sm text-slate-900">
              {isLeader ? t('add_installer_user') : 'Create NexusOps User Account'}
            </h2>
          </div>

          {isLeader && (
            <p className="text-xs text-[#0D9488] bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
              {t('vendor_locked_hint')}
            </p>
          )}

          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name *"
                className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Work Email *"
                className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 chars) *"
                className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />

              {isSuperAdmin && (
                <>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="DISPATCH">DISPATCH</option>
                    <option value="LEADER">LEADER</option>
                    <option value="INSTALLER">INSTALLER</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>

                  {(role === 'LEADER' || role === 'INSTALLER') && (
                    <select
                      required
                      value={vendorId}
                      onChange={(e) => setVendorId(e.target.value)}
                      className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                    >
                      <option value="">-- Select Vendor * --</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.code})
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>

            {areas.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-600">
                  Area Restrictions (leave empty for all vendor areas):
                </p>
                <div className="flex flex-wrap gap-2">
                  {areas.map((a) => (
                    <label
                      key={a.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 border border-[#E2E8F0] rounded-md bg-[#F8FAFC] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAreas.includes(a.id)}
                        onChange={() => toggleAreaSelection(a.id)}
                      />
                      <span>{a.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="min-h-[40px] px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              {isLeader ? t('add_installer_user') : 'Create User'}
            </button>
          </form>
        </section>
      )}

      {/* Super Admin Vendor, Area & Leader-to-Vendor Mapping Setup */}
      {isSuperAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form
            onSubmit={handleCreateVendor}
            className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-display font-semibold">
              <Building2 className="w-4 h-4 text-[#6D28D9]" />
              <span>Contractor / Vendors ({vendors.length})</span>
            </div>
            <input
              type="text"
              required
              value={vendorCode}
              onChange={(e) => setVendorCode(e.target.value)}
              placeholder="Code (e.g. VND-01)"
              className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg"
            />
            <input
              type="text"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Vendor Name"
              className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              Add Vendor
            </button>
            <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 text-xs">
              {vendors.map((v) => (
                <div key={v.id} className="py-1.5 flex justify-between">
                  <span className="font-medium">{v.name}</span>
                  <span className="font-mono text-slate-500">{v.code}</span>
                </div>
              ))}
            </div>
          </form>

          <form
            onSubmit={handleCreateArea}
            className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-display font-semibold">
              <MapPin className="w-4 h-4 text-[#6D28D9]" />
              <span>Service Areas ({areas.length})</span>
            </div>
            <input
              type="text"
              required
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              placeholder="Code (e.g. JKT-SEL)"
              className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg"
            />
            <input
              type="text"
              required
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              placeholder="Area Name (e.g. Jakarta Selatan)"
              className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              Add Area
            </button>
            <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 text-xs">
              {areas.map((a) => (
                <div key={a.id} className="py-1.5 flex justify-between">
                  <span className="font-medium">{a.name}</span>
                  <span className="font-mono text-slate-500">{a.code}</span>
                </div>
              ))}
            </div>
          </form>

          <form
            onSubmit={handleCreateMapping}
            className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-display font-semibold">
              <Plus className="w-4 h-4 text-[#6D28D9]" />
              <span>Leader-to-Vendor Mapping ({mappings.length})</span>
            </div>
            <select
              required
              value={mapVendorId}
              onChange={(e) => setMapVendorId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="">-- Vendor * --</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              value={mapAreaId}
              onChange={(e) => setMapAreaId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="">-- Wildcard (All Areas) --</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              required
              value={mapLeaderId}
              onChange={(e) => setMapLeaderId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="">-- Active Leader * --</option>
              {profiles
                .filter((p) => p.role === 'LEADER' && p.is_active)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-[#6D28D9] text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              Save Mapping
            </button>
          </form>
        </div>
      )}

      {/* Staff Directory Table */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h3 className="font-display font-semibold text-sm text-slate-900">
            {isLeader ? 'Vendor Installer Team Board' : 'Staff & Role Directory'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-slate-600">
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Vendor</th>
                <th className="py-2.5 px-4">Status</th>
                {isSuperAdmin && <th className="py-2.5 px-4 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleProfiles.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{u.full_name}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-600">{u.email}</td>
                  <td className="py-2.5 px-4 font-mono" style={{ color: ROLE_META[u.role].color }}>
                    {u.role}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {vendors.find((v) => v.id === u.vendor_id)?.name || 'Global'}
                  </td>
                  <td className="py-2.5 px-4 font-mono">
                    {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </td>
                  {isSuperAdmin && (
                    <td className="py-2.5 px-4 text-right">
                      {u.id !== profile.id && (
                        <button
                          type="button"
                          onClick={() => void handleToggleUserActive(u.id, u.is_active)}
                          className="text-[#7C3AED] hover:underline cursor-pointer"
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

/* ============================================================================
 * 2. REPORT QUEUE VIEW (Dispatch Review/Closing & Installer Reports)
 * ========================================================================== */
export const ReportQueueView: React.FC = () => {
  const { profile, workOrders, openWorkOrder } = useNexus();
  if (!profile) return null;

  const relevantWOs = workOrders.filter((w) => {
    if (profile.role === 'DISPATCH') {
      return [
        'REPORT_SUBMITTED',
        'APPROVED_READY_CLOSING',
        'OPEN_RESCHEDULE',
        'OPEN_PENDING',
      ].includes(w.operational_status);
    }
    if (profile.role === 'INSTALLER') {
      return [
        'ASSIGNED',
        'IN_PROGRESS',
        'REVISION_ACTIVE',
        'REJECTED_FOLLOWUP_ACTIVE',
        'REPORT_SUBMITTED',
      ].includes(w.operational_status);
    }
    return Boolean(w.latest_check_out_at || w.latest_review_decision);
  });

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-[#7C3AED]" />
        <h2 className="font-display font-semibold text-sm text-slate-900">
          {profile.role === 'DISPATCH'
            ? 'Dispatch Report Review & Final Closing Queue'
            : profile.role === 'INSTALLER'
              ? 'Technical Report & Revision Queue'
              : 'Submitted Technical Reports'}
        </h2>
      </div>
      {relevantWOs.length === 0 ? (
        <p className="p-8 text-center text-xs text-slate-500">
          No Work Orders awaiting report action.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {relevantWOs.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => openWorkOrder(w.id)}
              className="w-full text-left px-5 py-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 cursor-pointer"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-[#6D28D9]">
                  {w.wo_number} · <span className="text-slate-800">{w.operational_status}</span>
                </p>
                <p className="text-xs text-slate-600 truncate mt-0.5">
                  {w.customer_name} — {w.address_line}
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. COORDINATION CENTER (LiveChat, Exceptions & Escalations)
 * ========================================================================== */
export const CoordinationCenterView: React.FC = () => {
  const { workOrders, openWorkOrder } = useNexus();
  const activeOrException = workOrders.filter(
    (w) =>
      w.administrative_closure !== 'CLOSED' ||
      w.operational_status === 'GROUPING_EXCEPTION' ||
      w.active_wo_remapped_pending,
  );

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[#7C3AED]" />
        <h2 className="font-display font-semibold text-sm text-slate-900">
          Coordination Center (LiveChat, Exceptions & Escalations)
        </h2>
      </div>
      {activeOrException.length === 0 ? (
        <p className="p-8 text-center text-xs text-slate-500">
          All Work Orders are closed with zero pending exceptions.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {activeOrException.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => openWorkOrder(w.id)}
              className="w-full text-left px-5 py-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-slate-900">{w.wo_number}</span>
                  <span className="font-mono text-slate-500">{w.operational_status}</span>
                </div>
                {w.grouping_exception && (
                  <p className="text-xs text-[#D97706] flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{w.grouping_exception}</span>
                  </p>
                )}
              </div>
              <span className="text-xs font-medium text-[#7C3AED] shrink-0">
                Open Section 10/15
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 4. INSTALLER MOBILE PROFILE TAB
 * ========================================================================== */
export const InstallerProfileView: React.FC = () => {
  const { profile, vendors, language, setLanguage, signOut, t } = useNexus();
  if (!profile) return null;
  const vendor = vendors.find((v) => v.id === profile.vendor_id);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-2">
        <p className="text-xs font-mono font-semibold text-[#D97706]">
          INSTALLER / TECHNICIAN
        </p>
        <h2 className="font-display text-lg font-bold text-slate-900">
          {profile.full_name}
        </h2>
        <p className="text-xs text-slate-600">{profile.email}</p>
        <p className="text-xs text-slate-600">
          Vendor: <span className="font-semibold">{vendor?.name || '—'}</span>
        </p>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{t('language_label')}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setLanguage('id')}
            className={`px-3 py-1.5 text-xs font-mono rounded-md border cursor-pointer ${
              language === 'id' ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'border-[#E2E8F0]'
            }`}
          >
            ID
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-3 py-1.5 text-xs font-mono rounded-md border cursor-pointer ${
              language === 'en' ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'border-[#E2E8F0]'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void signOut()}
        className="w-full min-h-[44px] bg-white border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>{t('sign_out')}</span>
      </button>
    </div>
  );
};

/* ============================================================================
 * 5. SUPER ADMIN SYSTEM SETTINGS (ALL 17 CONFIGURATION MODULES)
 * ========================================================================== */
export const SystemSettingsView: React.FC = () => {
  const { profile, adminConfigs, refreshAllData } = useNexus();
  const [activeModKey, setActiveModKey] = useState<string>(
    SUPER_ADMIN_CONFIG_MODULES[0].key,
  );
  const [jsonDraft, setJsonDraft] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const selectedMod = SUPER_ADMIN_CONFIG_MODULES.find((m) => m.key === activeModKey);
  const currentConfig = adminConfigs.find((c) => c.module_key === activeModKey);

  useEffect(() => {
    setJsonDraft(JSON.stringify(currentConfig?.config_data ?? {}, null, 2));
    setSavedMsg(null);
    setErrMsg(null);
  }, [activeModKey, currentConfig]);

  useEffect(() => {
    const loadAudits = async () => {
      if (activeModKey !== 'audit_history') return;
      const supabase = await getSupabaseClient();
      if (!supabase) return;
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setAuditLogs((data ?? []) as AuditLogItem[]);
    };
    void loadAudits();
  }, [activeModKey]);

  if (profile?.role !== 'SUPER_ADMIN') {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-slate-600">
        System Settings (17 configuration modules) is strictly restricted to Super Admin.
      </div>
    );
  }

  const handleSaveConfig = async () => {
    setSavedMsg(null);
    setErrMsg(null);
    try {
      const parsed = JSON.parse(jsonDraft) as Record<string, unknown>;
      await NexusService.updateAdminConfiguration(activeModKey, parsed, profile.id);
      setSavedMsg(`Configuration module "${selectedMod?.title}" saved with audit log.`);
      await refreshAllData();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Invalid JSON or save failed');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left 17 Module Navigator */}
      <aside className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl p-3 space-y-1">
        <div className="px-2 py-2 border-b border-slate-100 flex items-center gap-2 mb-2">
          <Settings className="w-4 h-4 text-[#6D28D9]" />
          <h2 className="font-display font-semibold text-xs text-slate-900">
            17 Super Admin Modules
          </h2>
        </div>
        {SUPER_ADMIN_CONFIG_MODULES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActiveModKey(m.key)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeModKey === m.key
                ? 'bg-[#6D28D9] text-white'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="font-mono mr-2 opacity-75">
              {String(m.index).padStart(2, '0')}.
            </span>
            <span>{m.title}</span>
          </button>
        ))}
      </aside>

      {/* Right Configuration Editor */}
      <section className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-base text-slate-900">
              {selectedMod?.index}. {selectedMod?.title}
            </h3>
            <p className="text-xs font-mono text-slate-500">module_key: {activeModKey}</p>
          </div>
          {currentConfig?.updated_at && (
            <span className="text-[11px] font-mono text-slate-400">
              Updated {new Date(currentConfig.updated_at).toLocaleString()}
            </span>
          )}
        </div>

        {errMsg && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {errMsg}
          </div>
        )}
        {savedMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{savedMsg}</span>
          </div>
        )}

        {activeModKey === 'audit_history' ? (
          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono font-semibold text-slate-900">
                    {log.module_key} · {log.action}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {JSON.stringify(log.payload)}
                  </p>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-700">
              Configuration Payload (changes do not mutate stored historical WO snapshots)
            </label>
            <textarea
              rows={14}
              value={jsonDraft}
              onChange={(e) => setJsonDraft(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30"
            />
            <button
              type="button"
              onClick={() => void handleSaveConfig()}
              className="min-h-[40px] px-4 py-2 bg-[#6D28D9] hover:bg-violet-800 text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              Save Configuration & Write Audit Log
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
