import type { Area, ExecuteImportPayload, Vendor } from '../types/nexusops';

export interface ParsedImportTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export const MASTER_WO_IMPORT_FIELDS = [
  { key: 'wo_number', label: 'WO Number', required: true },
  { key: 'customer_name', label: 'Customer Name', required: true },
  { key: 'customer_phone', label: 'Customer Phone', required: false },
  { key: 'customer_id_ref', label: 'Customer ID / Ref', required: false },
  { key: 'service_type', label: 'Service Type', required: false },
  { key: 'appointment_date', label: 'Appointment Date (YYYY-MM-DD)', required: false },
  { key: 'appointment_slot', label: 'Appointment Slot', required: false },
  { key: 'network_odp', label: 'Network ODP', required: false },
  { key: 'network_ont_sn', label: 'ONT Serial Number', required: false },
  { key: 'network_vlan', label: 'Network VLAN', required: false },
  { key: 'address_line', label: 'Location / Address', required: true },
  { key: 'district', label: 'District', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'raw_vendor_name', label: 'Contractor / Vendor', required: true },
  { key: 'raw_area_name', label: 'Area', required: true },
] as const;

export type MasterWOImportFieldKey = (typeof MASTER_WO_IMPORT_FIELDS)[number]['key'];

function parseCsvLines(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((cell) => cell.length > 0));
}

function detectDelimiter(sampleLine: string): string {
  const tabCount = (sampleLine.match(/\t/g) || []).length;
  const pipeCount = (sampleLine.match(/\|/g) || []).length;
  const semiCount = (sampleLine.match(/;/g) || []).length;
  const commaCount = (sampleLine.match(/,/g) || []).length;
  const max = Math.max(tabCount, pipeCount, semiCount, commaCount);
  if (max === 0) return ',';
  if (tabCount === max) return '\t';
  if (pipeCount === max) return '|';
  if (semiCount === max) return ';';
  return ',';
}

export function parseTabularText(rawText: string): ParsedImportTable {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return { headers: [], rows: [] };

  const firstLine = cleaned.split(/\r?\n/)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const matrix = parseCsvLines(cleaned, delimiter);

  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0].map((h, idx) => (h ? h : `Column_${idx + 1}`));
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = (cells[idx] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows };
}

/**
 * Lazy-loaded XLSX parser (OBD-03 confirmed: supports XLSX from launch via dynamic import)
 */
export async function parseXlsxFile(file: File): Promise<ParsedImportTable> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[firstSheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  if (jsonRows.length === 0) return { headers: [], rows: [] };

  const headers = Object.keys(jsonRows[0]);
  const rows = jsonRows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h) => {
      record[h] = String(row[h] ?? '').trim();
    });
    return record;
  });

  return { headers, rows };
}

export function autoGuessColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<MasterWOImportFieldKey, string[]> = {
    wo_number: ['wo_number', 'wo number', 'wonumber', 'wo_no', 'wo', 'ticket', 'ticket_no'],
    customer_name: ['customer_name', 'customer', 'pelanggan', 'nama pelanggan', 'name'],
    customer_phone: ['customer_phone', 'phone', 'hp', 'telepon', 'no_hp', 'contact'],
    customer_id_ref: ['customer_id', 'customer_id_ref', 'cid', 'id_pelanggan'],
    service_type: ['service_type', 'service', 'layanan', 'paket'],
    appointment_date: ['appointment_date', 'appt_date', 'jadwal', 'tanggal', 'date'],
    appointment_slot: ['appointment_slot', 'slot', 'jam', 'time_slot'],
    network_odp: ['network_odp', 'odp', 'fat'],
    network_ont_sn: ['network_ont_sn', 'ont_sn', 'sn_ont', 'ont'],
    network_vlan: ['network_vlan', 'vlan'],
    address_line: ['address_line', 'address', 'alamat', 'lokasi', 'location'],
    district: ['district', 'kecamatan'],
    city: ['city', 'kota', 'kabupaten'],
    raw_vendor_name: ['vendor', 'contractor', 'mitra', 'raw_vendor_name', 'contractor/vendor'],
    raw_area_name: ['area', 'wilayah', 'zone', 'raw_area_name'],
  };

  for (const field of MASTER_WO_IMPORT_FIELDS) {
    const candidates = aliases[field.key];
    const match = headers.find((h) =>
      candidates.includes(h.trim().toLowerCase()),
    );
    if (match) {
      mapping[field.key] = match;
    }
  }
  return mapping;
}

export function validateImportRows(params: {
  rows: Array<Record<string, string>>;
  columnMapping: Record<string, string>;
  existingWoNumbers: Set<string>;
  vendors: Vendor[];
  areas: Area[];
}): ExecuteImportPayload['rows'] {
  const { rows, columnMapping, existingWoNumbers, vendors, areas } = params;
  const seenInBatch = new Set<string>();

  const vendorIndex = new Set(
    vendors.flatMap((v) => [v.name.trim().toLowerCase(), v.code.trim().toLowerCase()]),
  );
  const areaIndex = new Set(
    areas.flatMap((a) => [a.name.trim().toLowerCase(), a.code.trim().toLowerCase()]),
  );

  return rows.map((raw, idx) => {
    const getVal = (key: MasterWOImportFieldKey) => {
      const col = columnMapping[key];
      return col ? (raw[col] ?? '').trim() : '';
    };

    const woNumber = getVal('wo_number');
    const customerName = getVal('customer_name');
    const addressLine = getVal('address_line');
    const rawVendorName = getVal('raw_vendor_name');
    const rawAreaName = getVal('raw_area_name');
    const appointmentDate = getVal('appointment_date');

    const errors: string[] = [];
    let isDuplicate = false;

    if (!woNumber) {
      errors.push('Required field empty: wo_number');
    } else if (!/^[A-Za-z0-9._-]{3,40}$/.test(woNumber)) {
      errors.push(`Invalid wo_number format: "${woNumber}"`);
    } else {
      const normalizedWo = woNumber.toUpperCase();
      if (existingWoNumbers.has(normalizedWo) || seenInBatch.has(normalizedWo)) {
        isDuplicate = true;
        errors.push(`Duplicate WO Number: "${woNumber}"`);
      }
      seenInBatch.add(normalizedWo);
    }

    if (!customerName) errors.push('Required field empty: customer_name');
    if (!addressLine) errors.push('Required field empty: address_line');
    if (!rawVendorName) {
      errors.push('Required field empty: contractor/vendor');
    } else if (vendors.length > 0 && !vendorIndex.has(rawVendorName.toLowerCase())) {
      errors.push(`Unknown Contractor/Vendor: "${rawVendorName}"`);
    }

    if (!rawAreaName) {
      errors.push('Required field empty: area');
    } else if (areas.length > 0 && !areaIndex.has(rawAreaName.toLowerCase())) {
      errors.push(`Area mismatch / unregistered: "${rawAreaName}"`);
    }

    if (appointmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
      errors.push(`Invalid date format (expected YYYY-MM-DD): "${appointmentDate}"`);
    }

    const validation_status = isDuplicate
      ? 'DUPLICATE'
      : errors.length > 0
        ? 'INVALID'
        : 'VALID';

    return {
      row_index: idx + 1,
      raw_payload: raw,
      mapped: {
        wo_number: woNumber,
        customer_name: customerName,
        customer_phone: getVal('customer_phone') || undefined,
        customer_id_ref: getVal('customer_id_ref') || undefined,
        service_type: getVal('service_type') || undefined,
        appointment_date: appointmentDate || undefined,
        appointment_slot: getVal('appointment_slot') || undefined,
        network_odp: getVal('network_odp') || undefined,
        network_ont_sn: getVal('network_ont_sn') || undefined,
        network_vlan: getVal('network_vlan') || undefined,
        address_line: addressLine,
        district: getVal('district') || undefined,
        city: getVal('city') || undefined,
        raw_vendor_name: rawVendorName,
        raw_area_name: rawAreaName,
      },
      validation_status,
      errors,
    };
  });
}
