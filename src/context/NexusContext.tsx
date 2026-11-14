import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DICTIONARY } from '../i18n/dictionary';
import {
  getSupabaseClient,
  loadPublicConfig,
  resetPublicConfigCache,
  type PublicConfigStatus,
} from '../lib/supabase';
import { createInitialTableQueryState } from '../lib/tableQuery';
import type {
  ActiveRoute,
  AdminConfiguration,
  AppLanguage,
  Area,
  DisplayMode,
  ImportBatch,
  LeaderVendorMapping,
  NotificationItem,
  UniversalTableQueryState,
  UserProfile,
  Vendor,
  WorkOrder,
} from '../types/nexusops';

export type AuthGateState =
  | 'loading'
  | 'env_missing'
  | 'schema_missing'
  | 'needs_bootstrap'
  | 'unauthenticated'
  | 'authenticated';

interface BootstrapStatus {
  configured: boolean;
  schemaReady: boolean;
  initialized: boolean;
  schemaError?: string;
  missingEnv?: string[];
}

interface NexusContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: (key: string) => string;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  authState: AuthGateState;
  publicConfig: PublicConfigStatus | null;
  bootstrapStatus: BootstrapStatus | null;
  profile: UserProfile | null;
  activeRoute: ActiveRoute;
  setActiveRoute: (route: ActiveRoute) => void;
  activeWorkOrderId: string | null;
  openWorkOrder: (woId: string) => void;
  focusedSection: number | null;
  setFocusedSection: (sec: number | null) => void;
  tableQuery: UniversalTableQueryState;
  setTableQuery: React.Dispatch<React.SetStateAction<UniversalTableQueryState>>;
  workOrders: WorkOrder[];
  vendors: Vendor[];
  areas: Area[];
  profiles: UserProfile[];
  mappings: LeaderVendorMapping[];
  importBatches: ImportBatch[];
  adminConfigs: AdminConfiguration[];
  notifications: NotificationItem[];
  dataLoading: boolean;
  refreshAllData: () => Promise<void>;
  refreshAuthAndBootstrap: () => Promise<void>;
  signOut: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const NexusContext = createContext<NexusContextValue | null>(null);

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem('nexusops_lang');
    return saved === 'en' ? 'en' : 'id';
  });
  const [displayMode, setDisplayModeState] = useState<DisplayMode>('desktop');
  const [authState, setAuthState] = useState<AuthGateState>('loading');
  const [publicConfig, setPublicConfig] = useState<PublicConfigStatus | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [activeRoute, setActiveRoute] = useState<ActiveRoute>('dashboard');
  const [activeWorkOrderId, setActiveWorkOrderId] = useState<string | null>(null);
  const [focusedSection, setFocusedSection] = useState<number | null>(null);
  const [tableQuery, setTableQuery] = useState<UniversalTableQueryState>(() =>
    createInitialTableQueryState(15),
  );

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [mappings, setMappings] = useState<LeaderVendorMapping[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [adminConfigs, setAdminConfigs] = useState<AdminConfiguration[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const t = useCallback(
    (key: string) => DICTIONARY[language][key] ?? DICTIONARY.en[key] ?? key,
    [language],
  );

  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      setLanguageState(lang);
      localStorage.setItem('nexusops_lang', lang);
      if (profile) {
        const supabase = await getSupabaseClient();
        if (supabase) {
          await supabase
            .from('profiles')
            .update({ preferred_language: lang })
            .eq('id', profile.id);
        }
      }
    },
    [profile],
  );

  const setDisplayMode = useCallback(
    (mode: DisplayMode) => {
      if (profile?.role === 'INSTALLER') {
        setDisplayModeState('mobile');
        return;
      }
      setDisplayModeState(mode);
    },
    [profile?.role],
  );

  const openWorkOrder = useCallback((woId: string) => {
    setActiveWorkOrderId(woId);
    setFocusedSection(null);
    setActiveRoute('ticket_fullview');
  }, []);

  const refreshAllData = useCallback(async () => {
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    setDataLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [
        woRes,
        vendorRes,
        areaRes,
        profRes,
        mapRes,
        batchRes,
        cfgRes,
        notifRes,
      ] = await Promise.all([
        supabase.from('work_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('vendors').select('*').order('name'),
        supabase.from('areas').select('*').order('name'),
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('leader_vendor_mappings').select('*'),
        supabase.from('import_batches').select('*').order('created_at', { ascending: false }),
        supabase.from('admin_configurations').select('*'),
        supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (woRes.data) setWorkOrders(woRes.data as WorkOrder[]);
      if (vendorRes.data) setVendors(vendorRes.data as Vendor[]);
      if (areaRes.data) setAreas(areaRes.data as Area[]);
      if (profRes.data) setProfiles(profRes.data as UserProfile[]);
      if (mapRes.data) setMappings(mapRes.data as LeaderVendorMapping[]);
      if (batchRes.data) setImportBatches(batchRes.data as ImportBatch[]);
      if (cfgRes.data) setAdminConfigs(cfgRes.data as AdminConfiguration[]);
      if (notifRes.data) setNotifications(notifRes.data as NotificationItem[]);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const refreshAuthAndBootstrap = useCallback(async () => {
    setAuthState('loading');
    resetPublicConfigCache();
    const cfg = await loadPublicConfig();
    setPublicConfig(cfg);

    const bRes = await fetch('/api/bootstrap/status');
    const bStatus = (await bRes.json()) as BootstrapStatus;
    setBootstrapStatus(bStatus);

    if (!cfg.configured || !bStatus.configured) {
      setAuthState('env_missing');
      return;
    }

    if (!bStatus.schemaReady) {
      setAuthState('schema_missing');
      return;
    }

    if (!bStatus.initialized) {
      setAuthState('needs_bootstrap');
      return;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      setAuthState('env_missing');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setProfile(null);
      setAuthState('unauthenticated');
      return;
    }

    const { data: userProf } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (!userProf || !userProf.is_active) {
      await supabase.auth.signOut();
      setProfile(null);
      setAuthState('unauthenticated');
      return;
    }

    const typedProfile = userProf as UserProfile;
    setProfile(typedProfile);
    if (typedProfile.role === 'INSTALLER') {
      setDisplayModeState('mobile');
    }
    if (typedProfile.preferred_language === 'en' || typedProfile.preferred_language === 'id') {
      setLanguageState(typedProfile.preferred_language);
    }
    setAuthState('authenticated');
  }, []);

  useEffect(() => {
    void refreshAuthAndBootstrap();
  }, [refreshAuthAndBootstrap]);

  useEffect(() => {
    if (authState === 'authenticated' && profile) {
      void refreshAllData();
    }
  }, [authState, profile, refreshAllData]);

  const signOut = useCallback(async () => {
    const supabase = await getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    setWorkOrders([]);
    setNotifications([]);
    setActiveWorkOrderId(null);
    setActiveRoute('dashboard');
    setAuthState('unauthenticated');
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    if (!profile) return;
    const supabase = await getSupabaseClient();
    if (!supabase) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', profile.id)
      .eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [profile]);

  return (
    <NexusContext.Provider
      value={{
        language,
        setLanguage,
        t,
        displayMode,
        setDisplayMode,
        authState,
        publicConfig,
        bootstrapStatus,
        profile,
        activeRoute,
        setActiveRoute,
        activeWorkOrderId,
        openWorkOrder,
        focusedSection,
        setFocusedSection,
        tableQuery,
        setTableQuery,
        workOrders,
        vendors,
        areas,
        profiles,
        mappings,
        importBatches,
        adminConfigs,
        notifications,
        dataLoading,
        refreshAllData,
        refreshAuthAndBootstrap,
        signOut,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </NexusContext.Provider>
  );
};

export function useNexus(): NexusContextValue {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error('useNexus must be used within NexusProvider');
  return ctx;
}
