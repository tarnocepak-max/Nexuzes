import type { SortDirection, UniversalTableQueryState } from '../types/nexusops';

export function createInitialTableQueryState(pageSize = 15): UniversalTableQueryState {
  return {
    globalSearch: '',
    columnSearch: {},
    columnFilters: {},
    sortField: null,
    sortDirection: 'DEFAULT',
    page: 1,
    pageSize,
  };
}

export function cycleSortDirection(current: SortDirection): SortDirection {
  if (current === 'DEFAULT') return 'ASC';
  if (current === 'ASC') return 'DESC';
  return 'DEFAULT';
}

export function applyUniversalTableQuery<T>(
  items: T[],
  state: UniversalTableQueryState,
  extractors: {
    globalText: (row: T) => string;
    columnValues: Record<string, (row: T) => string | number | null | undefined>;
    sortValues: Record<string, (row: T) => string | number | null | undefined>;
  },
): { rows: T[]; totalCount: number; totalPages: number } {
  const globalTerm = state.globalSearch.trim().toLowerCase();

  let filtered = items.filter((row) => {
    if (globalTerm && !extractors.globalText(row).toLowerCase().includes(globalTerm)) {
      return false;
    }

    for (const [colKey, searchVal] of Object.entries(state.columnSearch)) {
      const needle = searchVal.trim().toLowerCase();
      if (!needle) continue;
      const getter = extractors.columnValues[colKey];
      const cell = getter ? String(getter(row) ?? '').toLowerCase() : '';
      if (!cell.includes(needle)) return false;
    }

    for (const [colKey, filterVal] of Object.entries(state.columnFilters)) {
      if (!filterVal || filterVal === 'ALL') continue;
      const getter = extractors.columnValues[colKey];
      const cell = getter ? String(getter(row) ?? '') : '';
      if (cell !== filterVal) return false;
    }

    return true;
  });

  if (state.sortField && state.sortDirection !== 'DEFAULT') {
    const sortGetter = extractors.sortValues[state.sortField];
    if (sortGetter) {
      const dir = state.sortDirection === 'ASC' ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        const av = sortGetter(a);
        const bv = sortGetter(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * dir;
        }
        return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
      });
    }
  }

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
  const safePage = Math.min(Math.max(1, state.page), totalPages);
  const start = (safePage - 1) * state.pageSize;
  const rows = filtered.slice(start, start + state.pageSize);

  return { rows, totalCount, totalPages };
}
