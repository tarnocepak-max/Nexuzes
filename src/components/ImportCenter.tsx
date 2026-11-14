import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Table2,
  Upload,
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import {
  MASTER_WO_IMPORT_FIELDS,
  autoGuessColumnMapping,
  parseTabularText,
  parseXlsxFile,
  validateImportRows,
  type ParsedImportTable,
} from '../lib/importParser';
import { NexusService } from '../services/nexusService';
import type { ImportBatchRow } from '../types/nexusops';

export const ImportCenter: React.FC = () => {
  const {
    profile,
    t,
    language,
    workOrders,
    vendors,
    areas,
    importBatches,
    refreshAllData,
  } = useNexus();

  const [sourceMode, setSourceMode] = useState<'CSV' | 'XLSX' | 'TEXT_TO_TABLE'>('CSV');
  const [fileName, setFileName] = useState<string>('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedImportTable | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [previewTab, setPreviewTab] = useState<'VALID' | 'PROBLEMS'>('VALID');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedBatchRows, setSelectedBatchRows] = useState<{
    batchCode: string;
    rows: ImportBatchRow[];
  } | null>(null);

  const isDispatch = profile?.role === 'DISPATCH';
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const existingWoNumbers = useMemo(
    () => new Set(workOrders.map((w) => w.wo_number.toUpperCase())),
    [workOrders],
  );

  const validatedRows = useMemo(() => {
    if (!parsed) return [];
    return validateImportRows({
      rows: parsed.rows,
      columnMapping,
      existingWoNumbers,
      vendors,
      areas,
    });
  }, [parsed, columnMapping, existingWoNumbers, vendors, areas]);

  const validRows = validatedRows.filter((r) => r.validation_status === 'VALID');
  const problemRows = validatedRows.filter((r) => r.validation_status !== 'VALID');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setFileName(file.name);

    try {
      let table: ParsedImportTable;
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        setSourceMode('XLSX');
        table = await parseXlsxFile(file);
      } else {
        setSourceMode('CSV');
        const text = await file.text();
        table = parseTabularText(text);
      }
      setParsed(table);
      setColumnMapping(autoGuessColumnMapping(table.headers));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  const handleTextParse = () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setFileName('text-to-table.txt');
    const table = parseTabularText(rawText);
    if (table.headers.length === 0 || table.rows.length === 0) {
      setErrorMsg('Provide header row and at least one data row.');
      return;
    }
    setParsed(table);
    setColumnMapping(autoGuessColumnMapping(table.headers));
  };

  const handleExecuteImport = async () => {
    if (!isDispatch || validatedRows.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const result = await NexusService.executeImport({
        source_type: sourceMode,
        file_name: fileName || undefined,
        column_mapping: columnMapping,
        rows: validatedRows,
      });
      setStatusMsg(
        `Batch ${result.batch.batch_code}: ${result.createdCount} Master WOs imported & grouped (${result.batch.invalid_rows} invalid, ${result.batch.duplicate_rows} duplicate skipped).`,
      );
      setParsed(null);
      setRawText('');
      await refreshAllData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleInspectBatch = async (batchId: string, batchCode: string) => {
    const rows = await NexusService.fetchImportBatchRows(batchId);
    setSelectedBatchRows({ batchCode, rows });
  };

  if (profile?.role === 'LEADER' || profile?.role === 'INSTALLER') {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-slate-700">
          {language === 'id'
            ? 'Import Master WO hanya tersedia untuk Dispatch (eksekusi) dan Super Admin (Batch Monitoring).'
            : 'Master WO Import is restricted to Dispatch (execution) and Super Admin (Batch Monitoring).'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Super Admin Read-Only Batch Monitoring Notice (OBD-04) */}
      {isSuperAdmin && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-start gap-3">
          <Eye className="w-5 h-5 text-[#6D28D9] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display font-semibold text-sm text-slate-900">
              {t('import_history_title')}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">{t('import_readonly_notice')}</p>
          </div>
        </div>
      )}

      {/* Dispatch Import Execution Workspace */}
      {isDispatch && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-base text-slate-900">
                {t('import_title')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                CSV · XLSX · Text-to-Table → Validation & Duplicate Check → 8-Case Automatic Vendor Grouping
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
              {(['CSV', 'XLSX', 'TEXT_TO_TABLE'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSourceMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    sourceMode === mode
                      ? 'bg-white text-[#2563EB] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'CSV'
                    ? 'CSV'
                    : mode === 'XLSX'
                      ? 'XLSX'
                      : 'Text-to-Table'}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {statusMsg}
            </div>
          )}

          {sourceMode === 'TEXT_TO_TABLE' ? (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                {t('import_paste_label')}
              </label>
              <textarea
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  'wo_number\tcustomer_name\taddress_line\tvendor\tarea\tappointment_date\nWO-2026-001\tPT Contoh\tJl. Sudirman 10\tVendor Alpha\tJakarta Selatan\t2026-11-15'
                }
                className="w-full p-3 font-mono text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
              />
              <button
                type="button"
                onClick={handleTextParse}
                className="min-h-[40px] px-4 py-2 bg-[#2563EB] text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
              >
                <Table2 className="w-4 h-4" />
                <span>{t('import_parse_btn')}</span>
              </button>
            </div>
          ) : (
            <label className="block border border-dashed border-slate-300 hover:border-[#2563EB] rounded-xl p-6 text-center cursor-pointer bg-[#F8FAFC] transition-colors">
              <Upload className="w-6 h-6 text-[#2563EB] mx-auto mb-2" />
              <p className="text-xs font-medium text-slate-800">
                {sourceMode === 'XLSX' ? t('import_source_xlsx') : t('import_source_csv')}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {fileName || 'Select .csv or .xlsx workbook'}
              </p>
              <input
                type="file"
                accept={sourceMode === 'XLSX' ? '.xlsx,.xls' : '.csv,.txt'}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}

          {/* Column Mapping & Valid/Problem Preview */}
          {parsed && (
            <div className="space-y-5 border-t border-[#E2E8F0] pt-5">
              <div>
                <h3 className="font-display font-semibold text-sm text-slate-900 mb-3">
                  {t('import_mapping_title')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {MASTER_WO_IMPORT_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-700">
                        {field.label}{' '}
                        {field.required && <span className="text-red-600">*</span>}
                      </label>
                      <select
                        value={columnMapping[field.key] ?? ''}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                      >
                        <option value="">-- Unmapped --</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Separated Valid vs Invalid/Duplicate Tabs */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('VALID')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer ${
                        previewTab === 'VALID'
                          ? 'bg-white text-[#16A34A] shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {t('import_valid_tab')} ({validRows.length})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('PROBLEMS')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer ${
                        previewTab === 'PROBLEMS'
                          ? 'bg-white text-red-600 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>
                        {t('import_invalid_tab')} ({problemRows.length})
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={busy || validRows.length === 0}
                    onClick={handleExecuteImport}
                    className="min-h-[40px] px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    {busy
                      ? 'Importing & Grouping...'
                      : `${t('import_confirm_btn')} (${validRows.length})`}
                  </button>
                </div>

                <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-slate-600">
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">WO Number</th>
                        <th className="py-2 px-3">Customer</th>
                        <th className="py-2 px-3">Vendor</th>
                        <th className="py-2 px-3">Area</th>
                        <th className="py-2 px-3">Status / Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(previewTab === 'VALID' ? validRows : problemRows).map((r) => (
                        <tr key={r.row_index}>
                          <td className="py-2 px-3 font-mono">{r.row_index}</td>
                          <td className="py-2 px-3 font-mono font-medium">
                            {r.mapped.wo_number || '—'}
                          </td>
                          <td className="py-2 px-3">{r.mapped.customer_name || '—'}</td>
                          <td className="py-2 px-3">{r.mapped.raw_vendor_name || '—'}</td>
                          <td className="py-2 px-3">{r.mapped.raw_area_name || '—'}</td>
                          <td className="py-2 px-3">
                            {r.validation_status === 'VALID' ? (
                              <span className="font-mono text-[#16A34A]">VALID</span>
                            ) : (
                              <span className="text-red-600 font-mono">
                                {r.validation_status}: {r.errors.join('; ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Import History & Batch Monitoring Table (Dispatch + Read-Only Super Admin) */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#7C3AED]" />
          <h3 className="font-display font-semibold text-sm text-slate-900">
            {t('import_history_title')}
          </h3>
        </div>

        {importBatches.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 text-center">
            No import batches recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-slate-600">
                  <th className="py-2.5 px-4">Batch Code</th>
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">File</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4 text-right">Valid</th>
                  <th className="py-2.5 px-4 text-right">Invalid</th>
                  <th className="py-2.5 px-4 text-right">Duplicate</th>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                      {b.batch_code}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{b.source_type}</td>
                    <td className="py-2.5 px-4 text-slate-600">{b.file_name || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{b.total_rows}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#16A34A]">
                      {b.valid_rows}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-red-600">
                      {b.invalid_rows}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#D97706]">
                      {b.duplicate_rows}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => void handleInspectBatch(b.id, b.batch_code)}
                        className="text-[#7C3AED] hover:underline font-medium cursor-pointer"
                      >
                        Rows
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedBatchRows && (
          <div className="border-t border-[#E2E8F0] p-4 bg-[#F8FAFC] space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono font-semibold text-slate-900">
                Batch Diagnostics: {selectedBatchRows.batchCode}
              </p>
              <button
                type="button"
                onClick={() => setSelectedBatchRows(null)}
                className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto bg-white border border-[#E2E8F0] rounded-lg divide-y divide-slate-100 text-xs">
              {selectedBatchRows.rows.map((row) => (
                <div
                  key={row.id || row.row_index}
                  className="px-3 py-2 flex items-center justify-between gap-4"
                >
                  <span className="font-mono text-slate-600">Row #{row.row_index}</span>
                  <span className="font-mono">{row.validation_status}</span>
                  <span className="text-slate-500 truncate flex-1">
                    {row.errors.length > 0 ? row.errors.join(', ') : 'OK'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
