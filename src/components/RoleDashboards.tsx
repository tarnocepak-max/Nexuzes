import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  Settings,
  Shield,
  Users,
  Wrench,
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { ROLE_META, SUPER_ADMIN_CONFIG_MODULES } from '../types/nexusops';

export const RoleDashboards: React.FC = () => {
  const {
    profile,
    language,
    t,
    workOrders,
    vendors,
    profiles,
    importBatches,
    setActiveRoute,
    openWorkOrder,
    setTableQuery,
  } = useNexus();

  if (!profile) return null;

  const roleMeta = ROLE_META[profile.role];
  const vendorName = (id?: string | null) =>
    vendors.find((v) => v.id === id)?.name ?? 'Unmapped';

  const openFilteredTickets = (statusFilter: string) => {
    const nextFilters: Record<string, string> =
      statusFilter === 'ALL' ? {} : { operational_status: statusFilter };
    setTableQuery((prev) => ({
      ...prev,
      page: 1,
      columnFilters: nextFilters,
    }));
    setActiveRoute(profile.role === 'INSTALLER' ? 'my_tickets' : 'tickets');
  };

  // Metrics derived purely from live Supabase PostgreSQL rows
  const totalCount = workOrders.length;
  const closedCount = workOrders.filter(
    (w) => w.administrative_closure === 'CLOSED',
  ).length;
  const exceptionCount = workOrders.filter(
    (w) => w.operational_status === 'GROUPING_EXCEPTION' || w.active_wo_remapped_pending,
  ).length;
  const pendingReviewCount = workOrders.filter(
    (w) => w.operational_status === 'REPORT_SUBMITTED',
  ).length;
  const readyForClosingCount = workOrders.filter(
    (w) => w.operational_status === 'APPROVED_READY_CLOSING',
  ).length;
  const unassignedCount = workOrders.filter(
    (w) => w.operational_status === 'GROUPED' && !w.assigned_installer_id,
  ).length;
  const checkedInCount = workOrders.filter((w) => Boolean(w.check_in_at)).length;
  const revisionCount = workOrders.filter(
    (w) =>
      w.operational_status === 'REVISION_ACTIVE' ||
      w.operational_status === 'REJECTED_FOLLOWUP_ACTIVE',
  ).length;

  const recentWOs = workOrders.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Welcome Summary Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {t('welcome_back')}{' '}
            <span className="font-semibold" style={{ color: roleMeta.color }}>
              {roleMeta.label}
            </span>
          </p>
          <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
            {profile.full_name}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {profile.vendor_id
              ? `Vendor Scope: ${vendorName(profile.vendor_id)}`
              : language === 'id'
                ? 'Akses Global Master Work Order'
                : 'Global Master Work Order Scope'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {profile.role === 'DISPATCH' && (
            <button
              type="button"
              onClick={() => setActiveRoute('import')}
              className="min-h-[40px] px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-medium rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{t('nav_import')}</span>
            </button>
          )}
          {profile.role === 'SUPER_ADMIN' && (
            <button
              type="button"
              onClick={() => setActiveRoute('system_settings')}
              className="min-h-[40px] px-4 py-2 bg-[#6D28D9] hover:bg-violet-800 text-white text-xs font-medium rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>{t('nav_system_settings')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openFilteredTickets('ALL')}
            className="min-h-[40px] px-4 py-2 bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <span>
              {profile.role === 'INSTALLER' ? t('nav_my_tickets') : t('nav_tickets')}
            </span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Role-Specific 4-KPI Strip */}
      {profile.role === 'SUPER_ADMIN' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t('total_wo')}
            value={totalCount}
            sub={`${closedCount} closed`}
            icon={ClipboardList}
            onClick={() => openFilteredTickets('ALL')}
          />
          <StatCard
            label="Active Users"
            value={profiles.filter((p) => p.is_active).length}
            sub={`${vendors.filter((v) => v.is_active).length} active vendors`}
            icon={Users}
            onClick={() => setActiveRoute('management_staff')}
          />
          <StatCard
            label="Import Batches"
            value={importBatches.length}
            sub="Read-only Batch Monitoring"
            icon={FileSpreadsheet}
            onClick={() => setActiveRoute('import')}
          />
          <StatCard
            label="Config Modules"
            value={SUPER_ADMIN_CONFIG_MODULES.length}
            sub="Governance & Audit"
            icon={Shield}
            onClick={() => setActiveRoute('system_settings')}
          />
        </div>
      )}

      {profile.role === 'DISPATCH' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t('total_wo')}
            value={totalCount}
            sub={`${importBatches.length} batches`}
            icon={ClipboardList}
            onClick={() => openFilteredTickets('ALL')}
          />
          <StatCard
            label={t('grouping_exceptions')}
            value={exceptionCount}
            sub="Requires mapping check"
            icon={AlertTriangle}
            tone={exceptionCount > 0 ? 'amber' : 'neutral'}
            onClick={() => openFilteredTickets('GROUPING_EXCEPTION')}
          />
          <StatCard
            label={t('pending_review')}
            value={pendingReviewCount}
            sub="Submitted reports"
            icon={Clock}
            tone={pendingReviewCount > 0 ? 'blue' : 'neutral'}
            onClick={() => openFilteredTickets('REPORT_SUBMITTED')}
          />
          <StatCard
            label="Ready Final Closing"
            value={readyForClosingCount}
            sub={`${closedCount} closed`}
            icon={CheckCircle2}
            tone={readyForClosingCount > 0 ? 'green' : 'neutral'}
            onClick={() => openFilteredTickets('APPROVED_READY_CLOSING')}
          />
        </div>
      )}

      {profile.role === 'LEADER' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Vendor Queue WOs"
            value={totalCount}
            sub={vendorName(profile.vendor_id)}
            icon={ClipboardList}
            onClick={() => openFilteredTickets('ALL')}
          />
          <StatCard
            label="Unassigned WOs"
            value={unassignedCount}
            sub="Ready for Assign Installer"
            icon={Wrench}
            tone={unassignedCount > 0 ? 'amber' : 'neutral'}
            onClick={() => openFilteredTickets('GROUPED')}
          />
          <StatCard
            label={t('checked_in_wo')}
            value={checkedInCount}
            sub="PROGRESS Check-in active"
            icon={CheckCircle2}
            onClick={() => openFilteredTickets('IN_PROGRESS')}
          />
          <StatCard
            label="Vendor Installers"
            value={
              profiles.filter(
                (p) => p.role === 'INSTALLER' && p.vendor_id === profile.vendor_id && p.is_active,
              ).length
            }
            sub="Active team members"
            icon={Users}
            onClick={() => setActiveRoute('management_staff')}
          />
        </div>
      )}

      {profile.role === 'INSTALLER' && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t('assigned_wo')}
            value={totalCount}
            sub={`${checkedInCount} checked in`}
            icon={ClipboardList}
            onClick={() => openFilteredTickets('ALL')}
          />
          <StatCard
            label={t('revision_needed')}
            value={revisionCount}
            sub="Needs follow-up"
            icon={AlertTriangle}
            tone={revisionCount > 0 ? 'amber' : 'neutral'}
            onClick={() => openFilteredTickets('REVISION_ACTIVE')}
          />
        </div>
      )}

      {/* Recent Work Orders Queue */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm text-slate-900">
            {language === 'id' ? 'Antrean Work Order Terbaru' : 'Recent Work Order Queue'}
          </h3>
          <button
            type="button"
            onClick={() => openFilteredTickets('ALL')}
            className="text-xs font-medium text-[#7C3AED] hover:underline cursor-pointer"
          >
            {language === 'id' ? 'Lihat Semua' : 'View All'}
          </button>
        </div>

        {recentWOs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-600 mb-3">
              {language === 'id'
                ? 'Belum ada Work Order dalam scope Anda.'
                : 'No Work Orders in your scope yet.'}
            </p>
            {profile.role === 'DISPATCH' && (
              <button
                type="button"
                onClick={() => setActiveRoute('import')}
                className="px-4 py-2 bg-[#7C3AED] text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                {language === 'id' ? 'Mulai Import WO' : 'Start WO Import'}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentWOs.map((wo) => (
              <button
                key={wo.id}
                type="button"
                onClick={() => openWorkOrder(wo.id)}
                className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-900">
                      {wo.wo_number}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-medium text-slate-800 truncate">
                      {wo.customer_name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {wo.raw_vendor_name || vendorName(wo.vendor_id)} · {wo.address_line}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="font-mono text-[11px] font-medium text-slate-700">
                    {wo.operational_status}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: number;
  sub: string;
  icon: React.FC<{ className?: string }>;
  tone?: 'neutral' | 'amber' | 'blue' | 'green';
  onClick?: () => void;
}> = ({ label, value, sub, icon: Icon, tone = 'neutral', onClick }) => {
  const toneClass =
    tone === 'amber'
      ? 'text-[#D97706]'
      : tone === 'blue'
        ? 'text-[#2563EB]'
        : tone === 'green'
          ? 'text-[#16A34A]'
          : 'text-[#7C3AED]';

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white border border-[#E2E8F0] hover:border-slate-300 rounded-xl p-4 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 truncate">{label}</span>
        <Icon className={`w-4 h-4 shrink-0 ${toneClass}`} />
      </div>
      <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
        {value}
      </div>
      <p className="text-[11px] text-slate-500 mt-1 truncate">{sub}</p>
    </button>
  );
};
