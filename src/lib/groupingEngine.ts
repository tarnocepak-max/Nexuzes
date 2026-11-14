import type {
  Area,
  GroupingEvaluationInput,
  GroupingEvaluationResult,
  LeaderVendorMapping,
  UserProfile,
  Vendor,
} from '../types/nexusops';

function normalize(val: string | null | undefined): string {
  return (val ?? '').trim().toLowerCase();
}

function findVendor(rawVendorName: string, vendors: Vendor[]): Vendor | undefined {
  const target = normalize(rawVendorName);
  if (!target) return undefined;
  return vendors.find(
    (v) => normalize(v.name) === target || normalize(v.code) === target,
  );
}

function findArea(rawAreaName: string, areas: Area[]): Area | undefined {
  const target = normalize(rawAreaName);
  if (!target) return undefined;
  return areas.find(
    (a) => normalize(a.name) === target || normalize(a.code) === target,
  );
}

/**
 * Deterministic 8-Case Automatic Vendor Grouping Engine
 * Strictly no random selection and no manual fallback during import grouping.
 */
export function evaluateDeterministicVendorGrouping(
  input: GroupingEvaluationInput,
): GroupingEvaluationResult {
  const vendor = findVendor(input.rawVendorName, input.vendors);

  // CASE 4: Vendor not found in Master Vendors
  if (!vendor) {
    return {
      vendorId: null,
      areaId: findArea(input.rawAreaName, input.areas)?.id ?? null,
      leaderId: null,
      groupingCase: 'CASE_4_VENDOR_NOT_FOUND',
      groupingException: `VENDOR_NOT_FOUND: "${input.rawVendorName}"`,
      operationalStatus: 'GROUPING_EXCEPTION',
    };
  }

  // CASE 5: Vendor exists but is inactive
  if (!vendor.is_active) {
    return {
      vendorId: vendor.id,
      areaId: findArea(input.rawAreaName, input.areas)?.id ?? null,
      leaderId: null,
      groupingCase: 'CASE_5_VENDOR_INACTIVE',
      groupingException: `VENDOR_INACTIVE: "${vendor.name}"`,
      operationalStatus: 'GROUPING_EXCEPTION',
    };
  }

  const area = findArea(input.rawAreaName, input.areas);
  const activeMappings: LeaderVendorMapping[] = input.mappings.filter(
    (m) => m.vendor_id === vendor.id && m.is_active,
  );

  // CASE 6: Valid Vendor, zero active Leader mappings configured
  if (activeMappings.length === 0) {
    return {
      vendorId: vendor.id,
      areaId: area?.id ?? null,
      leaderId: null,
      groupingCase: 'CASE_6_LEADER_MAPPING_MISSING',
      groupingException: `LEADER_MAPPING_MISSING: "${vendor.name}"`,
      operationalStatus: 'GROUPING_EXCEPTION',
    };
  }

  const leaderById = new Map<string, UserProfile>();
  for (const l of input.leaders) {
    leaderById.set(l.id, l);
  }

  // Filter area-exact mappings first, then wildcard (area_id === null)
  const areaExactMappings = area
    ? activeMappings.filter((m) => m.area_id === area.id)
    : [];
  const wildcardMappings = activeMappings.filter((m) => !m.area_id);

  // Multiple exact area mappings or multiple wildcard mappings without disambiguation -> CASE 8
  if (areaExactMappings.length > 1) {
    return {
      vendorId: vendor.id,
      areaId: area?.id ?? null,
      leaderId: null,
      groupingCase: 'CASE_8_MAPPING_AMBIGUOUS',
      groupingException: `MAPPING_AMBIGUOUS: Multiple active leader mappings for vendor "${vendor.name}" & area "${area?.name}"`,
      operationalStatus: 'GROUPING_EXCEPTION',
    };
  }

  if (areaExactMappings.length === 1) {
    const chosenMapping = areaExactMappings[0];
    const leader = leaderById.get(chosenMapping.leader_id);

    // CASE 7: Mapped Leader missing or inactive
    if (!leader || !leader.is_active || leader.role !== 'LEADER') {
      return {
        vendorId: vendor.id,
        areaId: area?.id ?? null,
        leaderId: null,
        groupingCase: 'CASE_7_LEADER_INACTIVE',
        groupingException: `LEADER_INACTIVE: Leader for "${vendor.name}" (${area?.name}) is inactive`,
        operationalStatus: 'GROUPING_EXCEPTION',
      };
    }

    // Distinguish Case 1 (single mapping for vendor + area match) vs Case 3 (area-specific disambiguation among multi-mappings)
    const groupingCase =
      activeMappings.length === 1
        ? 'CASE_1_SINGLE_LEADER_AREA_MATCH'
        : 'CASE_3_MULTI_MAPPING_AREA_MATCH';

    return {
      vendorId: vendor.id,
      areaId: area?.id ?? null,
      leaderId: leader.id,
      groupingCase,
      groupingException: null,
      operationalStatus: 'GROUPED',
    };
  }

  // No exact area mapping; evaluate wildcard mapping
  if (wildcardMappings.length > 1) {
    return {
      vendorId: vendor.id,
      areaId: area?.id ?? null,
      leaderId: null,
      groupingCase: 'CASE_8_MAPPING_AMBIGUOUS',
      groupingException: `MAPPING_AMBIGUOUS: Multiple wildcard mappings for vendor "${vendor.name}"`,
      operationalStatus: 'GROUPING_EXCEPTION',
    };
  }

  if (wildcardMappings.length === 1) {
    const chosenMapping = wildcardMappings[0];
    const leader = leaderById.get(chosenMapping.leader_id);

    if (!leader || !leader.is_active || leader.role !== 'LEADER') {
      return {
        vendorId: vendor.id,
        areaId: area?.id ?? null,
        leaderId: null,
        groupingCase: 'CASE_7_LEADER_INACTIVE',
        groupingException: `LEADER_INACTIVE: Wildcard leader for "${vendor.name}" is inactive`,
        operationalStatus: 'GROUPING_EXCEPTION',
      };
    }

    // CASE 2: Single wildcard leader mapping (applies regardless of area)
    return {
      vendorId: vendor.id,
      areaId: area?.id ?? null,
      leaderId: leader.id,
      groupingCase: 'CASE_2_SINGLE_LEADER_WILDCARD_AREA',
      groupingException: null,
      operationalStatus: 'GROUPED',
    };
  }

  // CASE 8: Mappings exist for other areas, none match incoming area and no wildcard exists
  return {
    vendorId: vendor.id,
    areaId: area?.id ?? null,
    leaderId: null,
    groupingCase: 'CASE_8_MAPPING_AMBIGUOUS',
    groupingException: `MAPPING_AMBIGUOUS: Area "${input.rawAreaName}" does not match configured area mappings for "${vendor.name}"`,
    operationalStatus: 'GROUPING_EXCEPTION',
  };
}
