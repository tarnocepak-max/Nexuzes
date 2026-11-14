import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Paperclip,
  Send,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import {
  NexusService,
  fetchWorkOrderFullviewBundle,
  uploadWOEvidence,
} from '../services/nexusService';
import {
  TICKET_FULLVIEW_SECTIONS,
  type AdministrativeClosure,
  type ChatCategory,
  type ReviewDecision,
  type TechnicalWorkOutcome,
  type WorkOrderFullviewBundle,
} from '../types/nexusops';

interface ConfigLevelOption {
  code: string;
  label: string;
  outcome?: TechnicalWorkOutcome;
  adminClosure?: AdministrativeClosure;
  operationalStatus?: string;
  children: Array<{ code: string; label: string }>;
}

export const TicketFullview: React.FC = () => {
  const {
    profile,
    activeWorkOrderId,
    setActiveRoute,
    t,
    vendors,
    areas,
    profiles,
    adminConfigs,
    refreshAllData,
  } = useNexus();

  const [bundle, setBundle] = useState<WorkOrderFullviewBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Section 7: Assign / Reassign Installer (Leader only)
  const [selectedInstallerId, setSelectedInstallerId] = useState('');
  const [assignReason, setAssignReason] = useState('');

  // Section 8: Team Tasks
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Section 10: LiveChat & Evidence
  const section10Ref = useRef<HTMLElement | null>(null);
  const [chatCategory, setChatCategory] = useState<ChatCategory>('PROGRESS');
  const [chatText, setChatText] = useState('');
  const [chatAttachmentId, setChatAttachmentId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Section 11: Material Request
  const [matName, setMatName] = useState('');
  const [matQty, setMatQty] = useState('1');
  const [matUnit, setMatUnit] = useState('meter');
  const [matDesc, setMatDesc] = useState('');

  // Section 12: Installer Technical Report
  const [repL1, setRepL1] = useState('');
  const [repL2, setRepL2] = useState('');
  const [repFindings, setRepFindings] = useState('');
  const [repWorkDesc, setRepWorkDesc] = useState('');
  const [repNotes, setRepNotes] = useState('');
  const [repRxPower, setRepRxPower] = useState('');
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);

  // Section 13: Dispatch Review
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');

  // Section 14: Dispatch Closing
  const [closeL1, setCloseL1] = useState('');
  const [closeL2, setCloseL2] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  // Section 15: Issue & Escalation
  const [issueSeverity, setIssueSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDesc, setIssueDesc] = useState('');

  const loadBundle = useCallback(async () => {
    if (!activeWorkOrderId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchWorkOrderFullviewBundle(activeWorkOrderId);
      setBundle(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [activeWorkOrderId]);

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  const reportLevels: ConfigLevelOption[] = useMemo(() => {
    const cfg = adminConfigs.find((c) => c.module_key === 'installer_report_l1_l2');
    const levels = (cfg?.config_data?.levels as ConfigLevelOption[] | undefined) ?? [];
    return levels;
  }, [adminConfigs]);

  const closingLevels: ConfigLevelOption[] = useMemo(() => {
    const cfg = adminConfigs.find((c) => c.module_key === 'dispatch_closing_l1_l2');
    const levels = (cfg?.config_data?.levels as ConfigLevelOption[] | undefined) ?? [];
    return levels;
  }, [adminConfigs]);

  useEffect(() => {
    if (!repL1 && reportLevels.length > 0) {
      setRepL1(reportLevels[0].code);
      setRepL2(reportLevels[0].children[0]?.code ?? '');
    }
  }, [reportLevels, repL1]);

  useEffect(() => {
    if (!closeL1 && closingLevels.length > 0) {
      setCloseL1(closingLevels[0].code);
      setCloseL2(closingLevels[0].children[0]?.code ?? '');
    }
  }, [closingLevels, closeL1]);

  const userMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  if (!profile || !activeWorkOrderId) return null;

  if (loading && !bundle) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-slate-500">
        Loading 17-section Ticket Fullview...
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center space-y-3">
        <p className="text-sm text-red-600">{errorMsg || 'Ticket unavailable'}</p>
        <button
          type="button"
          onClick={() =>
            setActiveRoute(profile.role === 'INSTALLER' ? 'my_tickets' : 'tickets')
          }
          className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
        >
          {t('back_to_list')}
        </button>
      </div>
    );
  }

  const wo = bundle.workOrder;
  const vendor = vendors.find((v) => v.id === wo.vendor_id);
  const area = areas.find((a) => a.id === wo.area_id);
  const leader = wo.leader_id ? userMap.get(wo.leader_id) : undefined;
  const installer = wo.assigned_installer_id
    ? userMap.get(wo.assigned_installer_id)
    : undefined;

  const eligibleInstallers = profiles.filter(
    (p) =>
      p.role === 'INSTALLER' &&
      p.is_active &&
      p.vendor_id === wo.vendor_id &&
      (!wo.area_id || p.area_ids.length === 0 || p.area_ids.includes(wo.area_id)),
  );

  const isLeader = profile.role === 'LEADER';
  const isDispatch = profile.role === 'DISPATCH';
  const isInstaller = profile.role === 'INSTALLER';
  const isAssignedInstaller =
    isInstaller && wo.assigned_installer_id === profile.id;

  const currentRepL1Obj = reportLevels.find((l) => l.code === repL1);
  const currentRepL2Obj = currentRepL1Obj?.children.find((c) => c.code === repL2);
  const currentCloseL1Obj = closingLevels.find((l) => l.code === closeL1);
  const currentCloseL2Obj = currentCloseL1Obj?.children.find((c) => c.code === closeL2);

  const handleUploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setErrorMsg(null);
    try {
      const att = await uploadWOEvidence(wo.id, profile.id, file);
      setChatAttachmentId(att.id);
      setSelectedEvidenceIds((prev) => [...prev, att.id]);
      await loadBundle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    setActionBanner(null);
    try {
      const res = await NexusService.sendChatMessage(
        wo.id,
        chatCategory,
        chatText.trim(),
        chatAttachmentId,
      );
      setChatText('');
      setChatAttachmentId(null);
      if (res.triggeredCheckIn) {
        setActionBanner(
          'Check-in recorded automatically from your first valid PROGRESS message.',
        );
      }
      await Promise.all([loadBundle(), refreshAllData()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignInstaller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallerId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await NexusService.assignOrReassignInstaller(
        wo.id,
        selectedInstallerId,
        assignReason,
      );
      setSelectedInstallerId('');
      setAssignReason('');
      setActionBanner('Installer assignment saved with full history preserved.');
      await Promise.all([loadBundle(), refreshAllData()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAddTeamTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const nextTasks = [
      ...(wo.team_tasks || []),
      {
        id: crypto.randomUUID(),
        title: newTaskTitle.trim(),
        completed: false,
        updated_at: new Date().toISOString(),
        updated_by_name: profile.full_name,
      },
    ];
    await NexusService.updateTeamTasks(wo.id, nextTasks);
    setNewTaskTitle('');
    await loadBundle();
  };

  const handleToggleTask = async (taskId: string) => {
    const nextTasks = (wo.team_tasks || []).map((task) =>
      task.id === taskId
        ? {
            ...task,
            completed: !task.completed,
            updated_at: new Date().toISOString(),
            updated_by_name: profile.full_name,
          }
        : task,
    );
    await NexusService.updateTeamTasks(wo.id, nextTasks);
    await loadBundle();
  };

  const handleSubmitMaterialRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      await NexusService.submitMaterialRequest(wo.id, {
        item_name: matName,
        quantity: Number(matQty),
        unit: matUnit,
        description: matDesc,
      });
      setMatName('');
      setMatQty('1');
      setMatDesc('');
      await loadBundle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Material request failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDecideMaterial = async (
    reqId: string,
    decision: 'APPROVED' | 'REJECTED',
  ) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await NexusService.decideMaterialRequest(
        wo.id,
        reqId,
        decision,
        `Dispatch ${decision} by ${profile.full_name}`,
      );
      await loadBundle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  };

  const redirectToCheckIn = () => {
    setChatCategory('PROGRESS');
    setActionBanner(t('checkin_required_banner'));
    section10Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wo.check_in_at) {
      redirectToCheckIn();
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await NexusService.submitReport(wo.id, {
        report_l1_code: repL1,
        report_l1_label: currentRepL1Obj?.label ?? repL1,
        report_l2_code: repL2,
        report_l2_label: currentRepL2Obj?.label ?? repL2,
        technical_findings: repFindings,
        work_description: repWorkDesc,
        additional_notes: repNotes,
        technical_measurements: repRxPower ? { optical_rx_dbm: repRxPower } : {},
        evidence_attachment_ids: selectedEvidenceIds,
      });
      setRepFindings('');
      setRepWorkDesc('');
      setRepNotes('');
      setActionBanner('Technical Report submitted & Check-out snapshot recorded.');
      await Promise.all([loadBundle(), refreshAllData()]);
    } catch (err) {
      const eObj = err as Error & { code?: string };
      if (eObj.code === 'CHECK_IN_REQUIRED') {
        redirectToCheckIn();
      } else {
        setErrorMsg(eObj.message || 'Failed to submit Report');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDispatchReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const latestReport = bundle.reports[0];
    if (!latestReport) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await NexusService.reviewReport(wo.id, {
        report_id: latestReport.id,
        decision: reviewDecision,
        review_notes: reviewNotes,
      });
      setReviewNotes('');
      setActionBanner(`Dispatch Review recorded: ${reviewDecision}`);
      await Promise.all([loadBundle(), refreshAllData()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFinalClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCloseL1Obj || !currentCloseL2Obj) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await NexusService.finalClose(wo.id, {
        closing_l1_code: currentCloseL1Obj.code,
        closing_l1_label: currentCloseL1Obj.label,
        closing_l2_code: currentCloseL2Obj.code,
        closing_l2_label: currentCloseL2Obj.label,
        technical_outcome: currentCloseL1Obj.outcome || 'COMPLETED',
        administrative_closure: currentCloseL1Obj.adminClosure || 'CLOSED',
        operational_status: currentCloseL1Obj.operationalStatus || 'CLOSED',
        closing_notes: closingNotes,
      });
      setClosingNotes('');
      setActionBanner('Final Closing completed & 15-field Final WO History appended.');
      await Promise.all([loadBundle(), refreshAllData()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Final Closing failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await NexusService.createIssue(wo.id, {
        severity: issueSeverity,
        title: issueTitle,
        description: issueDesc,
      });
      setIssueTitle('');
      setIssueDesc('');
      await loadBundle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to log issue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() =>
            setActiveRoute(profile.role === 'INSTALLER' ? 'my_tickets' : 'tickets')
          }
          className="min-h-[40px] px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('back_to_list')}</span>
        </button>

        <div className="text-xs text-slate-500 font-mono">
          17-Section Reusable Ticket Fullview
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {actionBanner && (
        <div className="p-3.5 rounded-xl bg-violet-50 border border-violet-200 text-xs text-[#6D28D9] flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionBanner}</span>
        </div>
      )}

      {/* EXACT 17 SECTIONS IN STRICT BLUEPRINT ORDER */}
      <div className="space-y-4">
        {/* 1. WO Header & Status */}
        <SectionCard index={1} title={TICKET_FULLVIEW_SECTIONS[0].title}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="font-mono text-lg font-bold text-[#6D28D9]">{wo.wo_number}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Created {new Date(wo.created_at).toLocaleString()} · Service:{' '}
                {wo.service_type || 'Standard Field Installation'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500 block">Operational Status</span>
                <span className="font-mono font-semibold text-slate-900">
                  {wo.operational_status}
                </span>
              </div>
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500 block">Technical Outcome</span>
                <span className="font-mono font-semibold text-slate-900">
                  {wo.technical_outcome || 'PENDING'}
                </span>
              </div>
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500 block">Admin Closure</span>
                <span className="font-mono font-semibold text-slate-900">
                  {wo.administrative_closure}
                </span>
              </div>
            </div>
          </div>
          {wo.active_wo_remapped_pending && (
            <p className="mt-3 text-xs font-mono text-[#D97706] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ACTIVE_WO_REMAPPED_PENDING — Mapping changed; assignedInstallerId & work history preserved.
            </p>
          )}
        </SectionCard>

        {/* 2. Customer Information */}
        <SectionCard index={2} title={TICKET_FULLVIEW_SECTIONS[1].title}>
          <InfoGrid
            items={[
              ['Customer Name', wo.customer_name],
              ['Phone', wo.customer_phone || '—'],
              ['Customer ID Ref', wo.customer_id_ref || '—'],
              ['Service Type', wo.service_type || '—'],
            ]}
          />
        </SectionCard>

        {/* 3. Appointment Information */}
        <SectionCard index={3} title={TICKET_FULLVIEW_SECTIONS[2].title}>
          <InfoGrid
            items={[
              ['Appointment Date', wo.appointment_date || '—'],
              ['Time Slot', wo.appointment_slot || '—'],
              ['SLA Due', wo.sla_due_at ? new Date(wo.sla_due_at).toLocaleString() : '—'],
            ]}
          />
        </SectionCard>

        {/* 4. Network Information */}
        <SectionCard index={4} title={TICKET_FULLVIEW_SECTIONS[3].title}>
          <InfoGrid
            items={[
              ['Network ODP', wo.network_odp || '—'],
              ['ONT Serial Number', wo.network_ont_sn || '—'],
              ['VLAN', wo.network_vlan || '—'],
              ['Network Notes', wo.network_notes || '—'],
            ]}
          />
        </SectionCard>

        {/* 5. Location & Address */}
        <SectionCard index={5} title={TICKET_FULLVIEW_SECTIONS[4].title}>
          <InfoGrid
            items={[
              ['Address', wo.address_line],
              ['District', wo.district || '—'],
              ['City', wo.city || '—'],
              [
                'Coordinates',
                wo.latitude != null && wo.longitude != null
                  ? `${wo.latitude}, ${wo.longitude}`
                  : '—',
              ],
            ]}
          />
        </SectionCard>

        {/* 6. Contractor/Vendor & Area */}
        <SectionCard index={6} title={TICKET_FULLVIEW_SECTIONS[5].title}>
          <InfoGrid
            items={[
              ['Contractor / Vendor', vendor?.name || wo.raw_vendor_name || '—'],
              ['Imported Vendor Raw', wo.raw_vendor_name || '—'],
              ['Area', area?.name || wo.raw_area_name || '—'],
              ['Grouping Case', wo.grouping_case || '—'],
            ]}
          />
          {wo.grouping_exception && (
            <p className="mt-2 text-xs font-mono text-red-600">
              Exception: {wo.grouping_exception}
            </p>
          )}
        </SectionCard>

        {/* 7. Leader & Installer Assignment */}
        <SectionCard index={7} title={TICKET_FULLVIEW_SECTIONS[6].title}>
          <InfoGrid
            items={[
              ['Assigned Leader', leader?.full_name || 'Unmapped'],
              ['Active Installer', installer?.full_name || 'Unassigned'],
              ['Assigned At', wo.assigned_at ? new Date(wo.assigned_at).toLocaleString() : '—'],
              ['Session Segments', String(bundle.assignments.length)],
            ]}
          />

          {/* Leader Assign / Reassign Form */}
          {isLeader && wo.vendor_id === profile.vendor_id && (
            <form
              onSubmit={handleAssignInstaller}
              className="mt-4 pt-4 border-t border-[#E2E8F0] grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
            >
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {wo.assigned_installer_id
                    ? t('reassign_installer')
                    : t('assign_installer')}
                </label>
                <select
                  required
                  value={selectedInstallerId}
                  onChange={(e) => setSelectedInstallerId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                >
                  <option value="">-- Select Eligible Installer --</option>
                  {eligibleInstallers.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.full_name} ({inst.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Reason / Handover Note
                </label>
                <input
                  type="text"
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  placeholder="Optional reason..."
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !selectedInstallerId}
                className="min-h-[40px] px-4 py-2 bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {wo.assigned_installer_id
                    ? t('reassign_installer')
                    : t('assign_installer')}
                </span>
              </button>
            </form>
          )}

          {bundle.assignments.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-600">
                Assignment Session History
              </p>
              {bundle.assignments.map((a) => (
                <div
                  key={a.id}
                  className="text-xs flex flex-wrap items-center justify-between gap-2 text-slate-600"
                >
                  <span className="font-mono">
                    Segment #{a.session_segment_no} · {a.action_type} →{' '}
                    {userMap.get(a.new_installer_id)?.full_name || a.new_installer_id}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {new Date(a.created_at).toLocaleString()}
                    {a.is_active_segment ? ' · ACTIVE' : ' · ARCHIVED'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 8. Team Tasks */}
        <SectionCard index={8} title={TICKET_FULLVIEW_SECTIONS[7].title}>
          <div className="space-y-2">
            {(wo.team_tasks || []).length === 0 ? (
              <p className="text-xs text-slate-500">No team tasks added yet.</p>
            ) : (
              (wo.team_tasks || []).map((task) => (
                <label
                  key={task.id}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 text-xs cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => void handleToggleTask(task.id)}
                      className="rounded border-slate-300 text-[#7C3AED]"
                    />
                    <span className={task.completed ? 'line-through text-slate-400' : 'text-slate-800'}>
                      {task.title}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {task.updated_by_name}
                  </span>
                </label>
              ))
            )}

            {(isDispatch || isAssignedInstaller) && (
              <form onSubmit={handleAddTeamTask} className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Add operational checklist task..."
                  className="flex-1 min-h-[38px] px-3 text-xs border border-[#E2E8F0] rounded-lg"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Add
                </button>
              </form>
            )}
          </div>
        </SectionCard>

        {/* 9. Work Progress & Check-in/Check-out */}
        <SectionCard index={9} title={TICKET_FULLVIEW_SECTIONS[8].title}>
          <InfoGrid
            items={[
              [
                'Check-in Timestamp',
                wo.check_in_at ? new Date(wo.check_in_at).toLocaleString() : 'NOT CHECKED IN',
              ],
              [
                'Latest Check-out Snapshot',
                wo.latest_check_out_at
                  ? new Date(wo.latest_check_out_at).toLocaleString()
                  : '—',
              ],
              ['Progress', `${wo.progress_percent}%`],
              ['Latest Progress Summary', wo.progress_summary || '—'],
            ]}
          />
        </SectionCard>

        {/* 10. LiveChat & Evidence */}
        <section
          ref={section10Ref}
          className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-display font-semibold text-sm text-slate-900">
              10. {TICKET_FULLVIEW_SECTIONS[9].title}
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              {bundle.chatMessages.length} messages · {bundle.attachments.length} evidence files
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
            {bundle.chatMessages.length === 0 ? (
              <p className="text-xs text-slate-500">
                No messages yet. First valid PROGRESS message from assigned Installer records Check-in.
              </p>
            ) : (
              bundle.chatMessages.map((msg) => {
                const sender = userMap.get(msg.sender_id);
                const att = msg.attachment_id
                  ? bundle.attachments.find((a) => a.id === msg.attachment_id)
                  : null;
                return (
                  <div
                    key={msg.id}
                    className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-slate-900">
                        {sender?.full_name || msg.sender_role} ·{' '}
                        <span className="font-mono text-[#7C3AED]">{msg.category}</span>
                        {msg.triggered_check_in && (
                          <span className="ml-2 font-mono text-[#16A34A]">
                            [CHECK-IN TRIGGERED]
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-slate-400">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-800">{msg.content}</p>
                    {att && (
                      <div className="pt-1">
                        {att.signed_url ? (
                          <a
                            href={att.signed_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[#2563EB] hover:underline"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span>
                              {att.file_name} (ID: {att.id.slice(0, 8)})
                            </span>
                          </a>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-500">
                            Evidence: {att.file_name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Leader strictly monitoring-only per OBD-06 */}
          {isLeader ? (
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-slate-600">
              {t('leader_monitoring_only')}
            </div>
          ) : (
            (isAssignedInstaller || isDispatch || profile.role === 'SUPER_ADMIN') && (
              <form onSubmit={handleSendChat} className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  {(['PROGRESS', 'ISSUE', 'REQUEST', 'GENERAL'] as ChatCategory[]).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setChatCategory(cat)}
                        className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer ${
                          chatCategory === cat
                            ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                            : 'bg-white text-slate-600 border-[#E2E8F0]'
                        }`}
                      >
                        {cat}
                      </button>
                    ),
                  )}

                  <label className="ml-auto px-3 py-1.5 text-xs font-medium bg-white border border-[#E2E8F0] rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>{uploadingFile ? 'Uploading...' : t('upload_evidence')}</span>
                    <input
                      type="file"
                      onChange={handleUploadEvidence}
                      disabled={uploadingFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {chatAttachmentId && (
                  <p className="text-[11px] font-mono text-[#16A34A]">
                    Attached Evidence ID: {chatAttachmentId}
                  </p>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder={
                      chatCategory === 'PROGRESS' && !wo.check_in_at
                        ? 'Send first PROGRESS message to trigger Check-in...'
                        : `Write ${chatCategory} update...`
                    }
                    className="flex-1 min-h-[42px] px-3 text-xs border border-[#E2E8F0] rounded-lg"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-[42px] px-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('send_message')}</span>
                  </button>
                </div>
              </form>
            )
          )}
        </section>

        {/* 11. Material Request */}
        <SectionCard index={11} title={TICKET_FULLVIEW_SECTIONS[10].title}>
          <div className="space-y-3">
            {bundle.materialRequests.length === 0 ? (
              <p className="text-xs text-slate-500">No material requests submitted.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {bundle.materialRequests.map((mr) => (
                  <div
                    key={mr.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {mr.item_name} ·{' '}
                        <span className="font-mono">
                          {mr.quantity} {mr.unit}
                        </span>
                      </p>
                      <p className="text-slate-500">{mr.description || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-800">
                        {mr.status}
                      </span>
                      {/* OBD-05: Only Dispatch can Approve/Reject Material Requests */}
                      {isDispatch && mr.status === 'REQUESTED' && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDecideMaterial(mr.id, 'APPROVED')}
                            className="px-2.5 py-1 bg-[#16A34A] text-white text-[11px] font-medium rounded cursor-pointer"
                          >
                            {t('approve_material')}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDecideMaterial(mr.id, 'REJECTED')}
                            className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-medium rounded cursor-pointer"
                          >
                            {t('reject_material')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isAssignedInstaller && (
              <form
                onSubmit={handleSubmitMaterialRequest}
                className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-2"
              >
                <input
                  type="text"
                  required
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  placeholder="Material name"
                  className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
                <input
                  type="number"
                  required
                  min="1"
                  value={matQty}
                  onChange={(e) => setMatQty(e.target.value)}
                  placeholder="Qty"
                  className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
                <input
                  type="text"
                  required
                  value={matUnit}
                  onChange={(e) => setMatUnit(e.target.value)}
                  placeholder="Unit (meter/pcs)"
                  className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-2 bg-[#D97706] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  {t('submit_material_request')}
                </button>
              </form>
            )}
          </div>
        </SectionCard>

        {/* 12. Installer Technical Report */}
        <SectionCard index={12} title={TICKET_FULLVIEW_SECTIONS[11].title}>
          {bundle.reports.length > 0 && (
            <div className="space-y-3 mb-4">
              {bundle.reports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3.5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#6D28D9]">
                      Report Revision v{rep.revision_no}
                    </span>
                    <span className="font-mono text-slate-500">
                      Check-out: {new Date(rep.check_out_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800">
                    {rep.report_l1_label} / {rep.report_l2_label}
                  </p>
                  <p className="text-slate-700">Findings: {rep.technical_findings}</p>
                  <p className="text-slate-700">Work: {rep.work_description}</p>
                </div>
              ))}
            </div>
          )}

          {isAssignedInstaller && (
            <div className="space-y-3">
              {!wo.check_in_at ? (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span>
                    Check-in is required before submitting an Installer Technical Report.
                  </span>
                  <button
                    type="button"
                    onClick={redirectToCheckIn}
                    className="px-3 py-2 bg-[#D97706] text-white font-medium rounded-lg shrink-0 cursor-pointer"
                  >
                    Go to Section 10 (PROGRESS Check-in)
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitReport} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Report Level 1
                      </label>
                      <select
                        value={repL1}
                        onChange={(e) => {
                          const code = e.target.value;
                          setRepL1(code);
                          const obj = reportLevels.find((l) => l.code === code);
                          setRepL2(obj?.children[0]?.code ?? '');
                        }}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                      >
                        {reportLevels.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Report Level 2
                      </label>
                      <select
                        value={repL2}
                        onChange={(e) => setRepL2(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                      >
                        {(currentRepL1Obj?.children ?? []).map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <textarea
                      rows={3}
                      required
                      value={repFindings}
                      onChange={(e) => setRepFindings(e.target.value)}
                      placeholder="Technical Findings *"
                      className="w-full p-2.5 text-xs border border-[#E2E8F0] rounded-lg"
                    />
                    <textarea
                      rows={3}
                      required
                      value={repWorkDesc}
                      onChange={(e) => setRepWorkDesc(e.target.value)}
                      placeholder="Work Description *"
                      className="w-full p-2.5 text-xs border border-[#E2E8F0] rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={repRxPower}
                      onChange={(e) => setRepRxPower(e.target.value)}
                      placeholder="Technical Measurement (e.g. Optical RX -19.4 dBm)"
                      className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                    />
                    <input
                      type="text"
                      value={repNotes}
                      onChange={(e) => setRepNotes(e.target.value)}
                      placeholder="Additional Notes"
                      className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-[42px] px-4 py-2 bg-[#D97706] hover:bg-amber-700 text-white text-xs font-medium rounded-lg flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>
                      {bundle.reports.length > 0 ? t('submit_revision') : t('submit_report')}
                    </span>
                  </button>
                </form>
              )}
            </div>
          )}
        </SectionCard>

        {/* 13. Dispatch Review */}
        <SectionCard index={13} title={TICKET_FULLVIEW_SECTIONS[12].title}>
          {bundle.reviews.length > 0 && (
            <div className="space-y-2 mb-4">
              {bundle.reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs flex items-center justify-between gap-4"
                >
                  <div>
                    <span className="font-mono font-bold text-[#2563EB]">{rev.decision}</span>
                    <p className="text-slate-700 mt-0.5">{rev.review_notes}</p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {new Date(rev.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isDispatch && bundle.reports.length > 0 && wo.administrative_closure !== 'CLOSED' && (
            <form onSubmit={handleDispatchReview} className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(['APPROVED', 'RETURNED_FOR_REVISION', 'REJECTED'] as ReviewDecision[]).map(
                  (dec) => (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => setReviewDecision(dec)}
                      className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border cursor-pointer ${
                        reviewDecision === dec
                          ? 'bg-[#2563EB] text-white border-[#2563EB]'
                          : 'bg-white text-slate-700 border-[#E2E8F0]'
                      }`}
                    >
                      {dec}
                    </button>
                  ),
                )}
              </div>
              <textarea
                rows={2}
                required
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Dispatch Review notes / Revision reason *"
                className="w-full p-2.5 text-xs border border-[#E2E8F0] rounded-lg"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-[40px] px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Submit Dispatch Review
              </button>
            </form>
          )}
        </SectionCard>

        {/* 14. Dispatch Closing */}
        <SectionCard index={14} title={TICKET_FULLVIEW_SECTIONS[13].title}>
          {wo.closing_l1_label && (
            <div className="mb-3 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs">
              <p className="font-semibold text-slate-900">
                {wo.closing_l1_label} / {wo.closing_l2_label}
              </p>
              <p className="font-mono text-slate-600 mt-1">
                Technical: {wo.technical_outcome} · Admin Closure: {wo.administrative_closure} ·
                Operational: {wo.operational_status}
              </p>
            </div>
          )}

          {isDispatch &&
            wo.latest_review_decision === 'APPROVED' &&
            wo.administrative_closure !== 'CLOSED' && (
              <form onSubmit={handleFinalClosing} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Closing Level 1 (4×3 Matrix)
                    </label>
                    <select
                      value={closeL1}
                      onChange={(e) => {
                        const code = e.target.value;
                        setCloseL1(code);
                        const obj = closingLevels.find((l) => l.code === code);
                        setCloseL2(obj?.children[0]?.code ?? '');
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                    >
                      {closingLevels.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label} ({l.operationalStatus})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Closing Level 2
                    </label>
                    <select
                      value={closeL2}
                      onChange={(e) => setCloseL2(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                    >
                      {(currentCloseL1Obj?.children ?? []).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <input
                  type="text"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Final Closing remarks..."
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[42px] px-4 py-2 bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  {t('execute_final_closing')}
                </button>
              </form>
            )}
        </SectionCard>

        {/* 15. Issue & Escalation */}
        <SectionCard index={15} title={TICKET_FULLVIEW_SECTIONS[14].title}>
          <div className="space-y-3">
            {bundle.issues.map((iss) => (
              <div
                key={iss.id}
                className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-red-600">
                    [{iss.severity}] {iss.title}
                  </span>
                  <span className="font-mono text-slate-500">{iss.status}</span>
                </div>
                <p className="text-slate-700 mt-1">{iss.description}</p>
              </div>
            ))}

            {(isAssignedInstaller || isDispatch) && (
              <form onSubmit={handleCreateIssue} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <select
                  value={issueSeverity}
                  onChange={(e) =>
                    setIssueSeverity(
                      e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
                    )
                  }
                  className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <input
                  type="text"
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="Issue title"
                  className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
                <input
                  type="text"
                  required
                  value={issueDesc}
                  onChange={(e) => setIssueDesc(e.target.value)}
                  placeholder="Escalation description"
                  className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Log Issue</span>
                </button>
              </form>
            )}
          </div>
        </SectionCard>

        {/* 16. Activity Timeline */}
        <SectionCard index={16} title={TICKET_FULLVIEW_SECTIONS[15].title}>
          <div className="space-y-2 text-xs">
            {bundle.finalHistory.map((ev) => (
              <div
                key={ev.history_id}
                className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100"
              >
                <div>
                  <span className="font-mono font-semibold text-slate-900">
                    #{ev.sequence_no} · {ev.event_type}
                  </span>
                  <p className="text-slate-600 mt-0.5">{ev.summary_note || '—'}</p>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                  {new Date(ev.occurred_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 17. Final WO History (Exact 15-field Append-Only Table) */}
        <SectionCard index={17} title={TICKET_FULLVIEW_SECTIONS[16].title}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-slate-600 font-mono">
                  <th className="py-2 px-2">seq</th>
                  <th className="py-2 px-2">event_type</th>
                  <th className="py-2 px-2">actor_role</th>
                  <th className="py-2 px-2">prev_status</th>
                  <th className="py-2 px-2">new_status</th>
                  <th className="py-2 px-2">tech_outcome</th>
                  <th className="py-2 px-2">admin_closure</th>
                  <th className="py-2 px-2">l1_snapshot</th>
                  <th className="py-2 px-2">l2_snapshot</th>
                  <th className="py-2 px-2">occurred_at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {bundle.finalHistory.map((h) => (
                  <tr key={h.history_id}>
                    <td className="py-2 px-2">{h.sequence_no}</td>
                    <td className="py-2 px-2 font-semibold">{h.event_type}</td>
                    <td className="py-2 px-2">{h.actor_role}</td>
                    <td className="py-2 px-2">{h.previous_operational_status || '—'}</td>
                    <td className="py-2 px-2">{h.new_operational_status}</td>
                    <td className="py-2 px-2">{h.technical_outcome_snapshot || '—'}</td>
                    <td className="py-2 px-2">{h.administrative_closure_snapshot}</td>
                    <td className="py-2 px-2">{h.category_l1_label_snapshot || '—'}</td>
                    <td className="py-2 px-2">{h.category_l2_label_snapshot || '—'}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {new Date(h.occurred_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

const SectionCard: React.FC<{
  index: number;
  title: string;
  children: React.ReactNode;
}> = ({ index, title, children }) => (
  <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
    <h3 className="font-display font-semibold text-sm text-slate-900 border-b border-slate-100 pb-2.5">
      {index}. {title}
    </h3>
    {children}
  </section>
);

const InfoGrid: React.FC<{ items: Array<[string, string]> }> = ({ items }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
    {items.map(([label, val]) => (
      <div key={label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
        <span className="text-[11px] text-slate-500 block">{label}</span>
        <span className="font-medium text-slate-900 break-words">{val}</span>
      </div>
    ))}
  </div>
);
