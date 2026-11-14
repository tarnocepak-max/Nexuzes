import React, { useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilterX,
  Search,
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import {
  applyUniversalTableQuery,
  createInitialTableQueryState,
  cycleSortDirection,
} from '../lib/tableQuery';
import type { WorkOrder } from '../types/nexusops';

export const MasterWOTable: React.FC = () => {
  const {
    profile,
    displayMode,
    t,
    workOrders,
    vendors,
    areas,
    profiles,
    tableQuery,
    setTableQuery,
    openWorkOrder,
    dataLoading,
  } = useNexus();

  const isMobileLayout = profile?.role === 'INSTALLER' || displayMode === 'mobile';

  const vendorMap = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.name])),
    [vendors],
  );
  const areaMap = useMemo(
    () => new Map(areas.map((a) => [a.id, a.name])),
    [areas],
  );
  const userMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name])),
    [profiles],
  );

  const uniqueStatuses = useMemo(
    () => Array.from(new Set(workOrders.map((w) => w.operational_status))).sort(),
    [workOrders],
  );

  const queryResult = useMemo(() => {
    return applyUniversalTableQuery<WorkOrder>(workOrders, tableQuery, {
      globalText: (w) =>
        [
          w.wo_number,
          w.customer_name,
          w.address_line,
          w.raw_vendor_name,
          w.vendor_id ? vendorMap.get(w.vendor_id) : '',
          w.raw_area_name,
          w.area_id ? areaMap.get(w.area_id) : '',
          w.leader_id ? userMap.get(w.leader_id) : '',
          w.assigned_installer_id ? userMap.get(w.assigned_installer_id) : '',
          w.operational_status,
        ]
          .filter(Boolean)
          .join(' '),
      columnValues: {
        wo_number: (w) => w.wo_number,
        customer_name: (w) => w.customer_name,
        vendor: (w) => (w.vendor_id ? vendorMap.get(w.vendor_id) : w.raw_vendor_name) ?? '',
        area: (w) => (w.area_id ? areaMap.get(w.area_id) : w.raw_area_name) ?? '',
        leader: (w) => (w.leader_id ? userMap.get(w.leader_id) : '') ?? '',
        installer: (w) =>
          (w.assigned_installer_id ? userMap.get(w.assigned_installer_id) : '') ?? '',
        operational_status: (w) => w.operational_status,
        appointment_date: (w) => w.appointment_date ?? '',
      },
      sortValues: {
        wo_number: (w) => w.wo_number,
        customer_name: (w) => w.customer_name,
        vendor: (w) => (w.vendor_id ? vendorMap.get(w.vendor_id) : w.raw_vendor_name) ?? '',
        area: (w) => (w.area_id ? areaMap.get(w.area_id) : w.raw_area_name) ?? '',
        operational_status: (w) => w.operational_status,
        appointment_date: (w) => (w.appointment_date ? Date.parse(w.appointment_date) : 0),
        check_in_at: (w) => (w.check_in_at ? Date.parse(w.check_in_at) : 0),
      },
    });
  }, [workOrders, tableQuery, vendorMap, areaMap, userMap]);

  const handleSort = (field: string) => {
    setTableQuery((prev) => {
      const nextDir =
        prev.sortField === field ? cycleSortDirection(prev.sortDirection) : 'ASC';
      return {
        ...prev,
        sortField: nextDir === 'DEFAULT' ? null : field,
        sortDirection: nextDir,
        page: 1,
      };
    });
  };

  const setColumnSearch = (col: string, val: string) => {
    setTableQuery((prev) => ({
      ...prev,
      page: 1,
      columnSearch: { ...prev.columnSearch, [col]: val },
    }));
  };

  const setColumnFilter = (col: string, val: string) => {
    setTableQuery((prev) => ({
      ...prev,
      page: 1,
      columnFilters: { ...prev.columnFilters, [col]: val },
    }));
  };

  const clearAllFilters = () => {
    setTableQuery(createInitialTableQueryState(tableQuery.pageSize));
  };

  const renderSortIcon = (field: string) => {
    if (tableQuery.sortField !== field || tableQuery.sortDirection === 'DEFAULT') {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    }
    return tableQuery.sortDirection === 'ASC' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#7C3AED]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#7C3AED]" />
    );
  };

  const hasActiveFilters =
    Boolean(tableQuery.globalSearch) ||
    Object.values(tableQuery.columnSearch).some(Boolean) ||
    Object.values(tableQuery.columnFilters).some((v) => Boolean(v) && v !== 'ALL') ||
    tableQuery.sortDirection !== 'DEFAULT';

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={tableQuery.globalSearch}
              onChange={(e) =>
                setTableQuery((prev) => ({
                  ...prev,
                  globalSearch: e.target.value,
                  page: 1,
                }))
              }
              placeholder={t('global_search_placeholder')}
              className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tableQuery.columnFilters.operational_status ?? 'ALL'}
              onChange={(e) => setColumnFilter('operational_status', e.target.value)}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium bg-white border border-[#E2E8F0] rounded-lg text-slate-700"
            >
              <option value="ALL">{t('all_statuses')}</option>
              {uniqueStatuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium border border-[#E2E8F0] rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5 text-[#7C3AED]" />
                <span>{t('clear_all_filters')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-mono tabular-nums">
            Showing {queryResult.rows.length} of {queryResult.totalCount} Work Orders
          </span>
          {tableQuery.sortField && tableQuery.sortDirection !== 'DEFAULT' && (
            <span className="font-mono">
              Sort: {tableQuery.sortField} ({tableQuery.sortDirection})
            </span>
          )}
        </div>
      </div>

      {/* Mobile Card List (retains key WO columns without horizontal overflow) */}
      {isMobileLayout ? (
        <div className="space-y-2.5">
          {queryResult.rows.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-slate-500">
              {dataLoading ? 'Loading...' : t('no_wo_found')}
            </div>
          ) : (
            queryResult.rows.map((wo) => (
              <button
                key={wo.id}
                type="button"
                onClick={() => openWorkOrder(wo.id)}
                className="w-full text-left bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 active:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#7C3AED]">
                    {wo.wo_number}
                  </span>
                  <span className="font-mono text-[11px] font-medium text-slate-700">
                    {wo.operational_status}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {wo.customer_name}
                </p>
                <p className="text-xs text-slate-500 truncate">{wo.address_line}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <span>{wo.vendor_id ? vendorMap.get(wo.vendor_id) : wo.raw_vendor_name}</span>
                  <span>·</span>
                  <span>{wo.area_id ? areaMap.get(wo.area_id) : wo.raw_area_name}</span>
                  <span>·</span>
                  <span className="font-mono">
                    {wo.check_in_at ? 'Checked In' : 'No Check-in'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        /* Desktop High-Density Data Grid with Per-Column Search & 3-State Sort */
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-slate-700">
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('wo_number')}
                      className="flex items-center gap-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t('col_wo_number')}</span>
                      {renderSortIcon('wo_number')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('customer_name')}
                      className="flex items-center gap-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t('col_customer')}</span>
                      {renderSortIcon('customer_name')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('vendor')}
                      className="flex items-center gap-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t('col_vendor')}</span>
                      {renderSortIcon('vendor')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('area')}
                      className="flex items-center gap-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t('col_area')}</span>
                      {renderSortIcon('area')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">{t('col_installer')}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('operational_status')}
                      className="flex items-center gap-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t('col_status')}</span>
                      {renderSortIcon('operational_status')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('appointment_date')}
                      className="flex items-center gap-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t('col_appointment')}</span>
                      {renderSortIcon('appointment_date')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('check_in_at')}
                      className="flex items-center gap-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t('col_checkin')}</span>
                      {renderSortIcon('check_in_at')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    {t('col_action')}
                  </th>
                </tr>

                {/* Combinable Per-Column Search Row */}
                <tr className="border-b border-[#E2E8F0] bg-white">
                  <th className="p-2">
                    <input
                      type="text"
                      value={tableQuery.columnSearch.wo_number ?? ''}
                      onChange={(e) => setColumnSearch('wo_number', e.target.value)}
                      placeholder="Filter WO..."
                      className="w-full px-2 py-1 text-xs font-normal border border-[#E2E8F0] rounded bg-[#F8FAFC]"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      value={tableQuery.columnSearch.customer_name ?? ''}
                      onChange={(e) => setColumnSearch('customer_name', e.target.value)}
                      placeholder="Filter customer..."
                      className="w-full px-2 py-1 text-xs font-normal border border-[#E2E8F0] rounded bg-[#F8FAFC]"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      value={tableQuery.columnSearch.vendor ?? ''}
                      onChange={(e) => setColumnSearch('vendor', e.target.value)}
                      placeholder="Filter vendor..."
                      className="w-full px-2 py-1 text-xs font-normal border border-[#E2E8F0] rounded bg-[#F8FAFC]"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      value={tableQuery.columnSearch.area ?? ''}
                      onChange={(e) => setColumnSearch('area', e.target.value)}
                      placeholder="Filter area..."
                      className="w-full px-2 py-1 text-xs font-normal border border-[#E2E8F0] rounded bg-[#F8FAFC]"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      value={tableQuery.columnSearch.installer ?? ''}
                      onChange={(e) => setColumnSearch('installer', e.target.value)}
                      placeholder="Filter installer..."
                      className="w-full px-2 py-1 text-xs font-normal border border-[#E2E8F0] rounded bg-[#F8FAFC]"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      value={tableQuery.columnSearch.operational_status ?? ''}
                      onChange={(e) =>
                        setColumnSearch('operational_status', e.target.value)
                      }
                      placeholder="Filter status..."
                      className="w-full px-2 py-1 text-xs font-normal border border-[#E2E8F0] rounded bg-[#F8FAFC]"
                    />
                  </th>
                  <th className="p-2" colSpan={3} />
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {queryResult.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      {dataLoading ? 'Loading Master Work Orders...' : t('no_wo_found')}
                    </td>
                  </tr>
                ) : (
                  queryResult.rows.map((wo) => (
                    <tr
                      key={wo.id}
                      onClick={() => openWorkOrder(wo.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#6D28D9] whitespace-nowrap">
                        {wo.wo_number}
                      </td>
                      <td className="py-2.5 px-3 max-w-[180px]">
                        <p className="font-medium text-slate-900 truncate">
                          {wo.customer_name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {wo.address_line}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">
                        {wo.vendor_id
                          ? vendorMap.get(wo.vendor_id)
                          : wo.raw_vendor_name || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">
                        {wo.area_id
                          ? areaMap.get(wo.area_id)
                          : wo.raw_area_name || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">
                        {wo.assigned_installer_id
                          ? userMap.get(wo.assigned_installer_id)
                          : 'Unassigned'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-mono text-[11px] font-medium text-slate-800">
                          {wo.operational_status}
                        </span>
                        {wo.active_wo_remapped_pending && (
                          <span className="block text-[10px] font-mono text-[#D97706]">
                            ACTIVE_WO_REMAPPED_PENDING
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-slate-600">
                        {wo.appointment_date || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-slate-600">
                        {wo.check_in_at
                          ? new Date(wo.check_in_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openWorkOrder(wo.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#7C3AED] hover:bg-[#7C3AED]/10 rounded cursor-pointer"
                        >
                          <span>Fullview</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      <div className="flex items-center justify-between bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 text-xs text-slate-600">
        <span className="font-mono tabular-nums">
          Page {tableQuery.page} / {queryResult.totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={tableQuery.page <= 1}
            onClick={() =>
              setTableQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
            }
            className="min-h-[36px] px-3 border border-[#E2E8F0] rounded-lg disabled:opacity-40 flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={tableQuery.page >= queryResult.totalPages}
            onClick={() =>
              setTableQuery((prev) => ({
                ...prev,
                page: Math.min(queryResult.totalPages, prev.page + 1),
              }))
            }
            className="min-h-[36px] px-3 border border-[#E2E8F0] rounded-lg disabled:opacity-40 flex items-center gap-1 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
