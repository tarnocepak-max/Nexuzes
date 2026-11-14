import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Monitor,
  Settings,
  Smartphone,
  Ticket,
  UserCircle,
  Users,
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import {
  ROLE_META,
  type ActiveRoute,
  type InstallerTabKey,
  type SidebarMenuKey,
} from '../types/nexusops';

const DESKTOP_SIDEBAR_ITEMS: Array<{
  key: SidebarMenuKey;
  labelKey: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { key: 'dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
  { key: 'tickets', labelKey: 'nav_tickets', icon: Ticket },
  { key: 'report', labelKey: 'nav_report', icon: ClipboardCheck },
  { key: 'management_staff', labelKey: 'nav_management_staff', icon: Users },
  { key: 'import', labelKey: 'nav_import', icon: FileSpreadsheet },
  { key: 'coordination_center', labelKey: 'nav_coordination_center', icon: MessageSquare },
];

const INSTALLER_BOTTOM_TABS: Array<{
  key: InstallerTabKey;
  labelKey: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { key: 'dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
  { key: 'my_tickets', labelKey: 'nav_my_tickets', icon: Ticket },
  { key: 'reports', labelKey: 'nav_reports', icon: ClipboardCheck },
  { key: 'coordination', labelKey: 'nav_coordination', icon: MessageSquare },
  { key: 'profile', labelKey: 'nav_profile', icon: UserCircle },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    profile,
    t,
    language,
    setLanguage,
    displayMode,
    setDisplayMode,
    activeRoute,
    setActiveRoute,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    openWorkOrder,
    signOut,
    vendors,
  } = useNexus();

  const [notifOpen, setNotifOpen] = useState(false);

  if (!profile) return null;

  const isInstaller = profile.role === 'INSTALLER';
  const effectiveMobile = isInstaller || displayMode === 'mobile';
  const roleMeta = ROLE_META[profile.role];
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const vendorName =
    vendors.find((v) => v.id === profile.vendor_id)?.name ?? null;

  const handleNotificationClick = async (
    id: string,
    woId: string | null | undefined,
  ) => {
    await markNotificationRead(id);
    setNotifOpen(false);
    if (woId) openWorkOrder(woId);
  };

  const renderNotifDrawer = () =>
    notifOpen && (
      <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[1px]">
        <div
          className="flex-1"
          onClick={() => setNotifOpen(false)}
          aria-hidden="true"
        />
        <aside className="w-full max-w-sm bg-white border-l border-[#E2E8F0] h-full flex flex-col">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-sm text-slate-900">
                {t('notifications')}
              </h3>
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                {unreadCount} unread
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllNotificationsRead()}
                  className="text-xs text-[#7C3AED] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>{t('mark_all_read')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                className="px-2.5 py-1 text-xs border border-[#E2E8F0] rounded-md text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <p className="p-6 text-xs text-slate-500 text-center">
                {t('no_notifications')}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() =>
                    void handleNotificationClick(n.id, n.work_order_id)
                  }
                  className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer ${
                    n.is_read ? 'bg-white' : 'bg-[#7C3AED]/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span className="font-mono font-medium text-slate-700">
                      {n.event_type}
                    </span>
                    <span className="font-mono tabular-nums">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 leading-relaxed">
                    {n.message}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    );

  // MOBILE SHELL (Installer always OR Desktop roles in Mobile Mode preview)
  if (effectiveMobile) {
    const mobileTabs = isInstaller
      ? INSTALLER_BOTTOM_TABS
      : DESKTOP_SIDEBAR_ITEMS.slice(0, 5).map((item) => ({
          key: item.key as ActiveRoute,
          labelKey: item.labelKey,
          icon: item.icon,
        }));

    return (
      <div className="min-h-screen bg-slate-100 flex justify-center">
        <div className="w-full max-w-[440px] min-h-screen bg-[#F8FAFC] border-x border-[#E2E8F0] flex flex-col relative">
          {/* Compact Mobile Header (keeps combined sticky height <= 15% viewport) */}
          <header className="sticky top-0 z-30 h-13 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0] px-3 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-7 h-7 rounded-md text-white flex items-center justify-center font-display font-bold text-xs shrink-0"
                style={{ backgroundColor: roleMeta.color }}
              >
                N
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-sm text-slate-900 truncate">
                  NexusOps
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Language Toggle */}
              <button
                type="button"
                onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
                className="min-h-[36px] px-2 text-[11px] font-mono font-semibold border border-[#E2E8F0] rounded-md text-slate-700 bg-white cursor-pointer"
              >
                {language.toUpperCase()}
              </button>

              {/* Display Mode Switcher ONLY for Super Admin, Dispatch, Leader (NOT Installer) */}
              {!isInstaller && (
                <button
                  type="button"
                  onClick={() => setDisplayMode('desktop')}
                  title={t('mode_desktop')}
                  className="min-h-[36px] px-2 text-[11px] font-medium border border-[#E2E8F0] rounded-md text-slate-700 bg-white flex items-center gap-1 cursor-pointer"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                aria-label={t('notifications')}
                className="min-h-[36px] min-w-[36px] relative border border-[#E2E8F0] rounded-md bg-white flex items-center justify-center text-slate-700 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-[#7C3AED] text-white text-[10px] font-mono flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {!isInstaller && (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  aria-label={t('sign_out')}
                  className="min-h-[36px] min-w-[36px] border border-[#E2E8F0] rounded-md bg-white flex items-center justify-center text-slate-600 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </header>

          {/* Main Scrollable Viewport */}
          <main className="flex-1 p-3 pb-20 overflow-y-auto">{children}</main>

          {/* Fixed Bottom Navigation (5 Tabs for Installer, compact <= 60px) */}
          <nav className="fixed bottom-0 w-full max-w-[440px] z-30 h-15 bg-white/95 backdrop-blur-sm border-t border-[#E2E8F0] grid grid-cols-5 items-center">
            {mobileTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                activeRoute === tab.key ||
                (activeRoute === 'ticket_fullview' &&
                  (tab.key === 'my_tickets' || tab.key === 'tickets'));
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveRoute(tab.key as ActiveRoute)}
                  className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 transition-colors cursor-pointer ${
                    isActive ? 'text-[#7C3AED]' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium truncate max-w-full">
                    {t(tab.labelKey)}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
        {renderNotifDrawer()}
      </div>
    );
  }

  // DESKTOP SHELL (Super Admin, Dispatch, Leader)
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* 260px Fixed Sidebar with exact 6 Primary Menu Items */}
      <aside className="w-[260px] shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col justify-between sticky top-0 h-screen">
        <div>
          <div className="h-16 px-5 border-b border-[#E2E8F0] flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg text-white flex items-center justify-center font-display font-bold text-sm shrink-0"
              style={{ backgroundColor: roleMeta.color }}
            >
              N
            </div>
            <div className="min-w-0">
              <span className="font-display font-bold text-base text-slate-900 block leading-tight">
                NexusOps
              </span>
              <span
                className="text-[11px] font-medium block truncate"
                style={{ color: roleMeta.color }}
              >
                {roleMeta.label}
              </span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {DESKTOP_SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeRoute === item.key ||
                (activeRoute === 'ticket_fullview' && item.key === 'tickets');
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveRoute(item.key)}
                  className={`w-full min-h-[42px] px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#7C3AED]/10 text-[#6D28D9]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Utility Area (System Settings resides here, NOT 7th primary menu) */}
        <div className="p-3 border-t border-[#E2E8F0] space-y-2">
          {profile.role === 'SUPER_ADMIN' && (
            <button
              type="button"
              onClick={() => setActiveRoute('system_settings')}
              className={`w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                activeRoute === 'system_settings'
                  ? 'bg-[#6D28D9] text-white'
                  : 'text-slate-700 bg-slate-50 hover:bg-slate-100 border border-[#E2E8F0]'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>{t('nav_system_settings')}</span>
            </button>
          )}

          <div className="px-2 py-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {profile.full_name}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {vendorName ? vendorName : profile.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              title={t('sign_out')}
              className="p-2 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean 3-Zone Top Bar */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-[#E2E8F0] px-6 flex items-center justify-between gap-8">
          <div className="min-w-0">
            <h1 className="font-display font-bold text-base text-slate-900 truncate">
              {activeRoute === 'ticket_fullview'
                ? 'Ticket Fullview'
                : activeRoute === 'system_settings'
                  ? t('nav_system_settings')
                  : t(
                      `nav_${
                        activeRoute === 'my_tickets'
                          ? 'tickets'
                          : activeRoute === 'reports'
                            ? 'report'
                            : activeRoute
                      }`,
                    )}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Language Switcher without reload */}
            <div className="flex items-center p-0.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
              <button
                type="button"
                onClick={() => setLanguage('id')}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                  language === 'id'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                ID
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                EN
              </button>
            </div>

            {/* Display Mode Switcher (Super Admin, Dispatch, Leader only) */}
            <div className="flex items-center p-0.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
              <button
                type="button"
                onClick={() => setDisplayMode('desktop')}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-white text-slate-900 shadow-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5 text-[#7C3AED]" />
                <span>{t('mode_desktop')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('mobile')}
                className="px-2.5 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{t('mode_mobile')}</span>
              </button>
            </div>

            {/* Notification Trigger */}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="min-h-[38px] px-3 border border-[#E2E8F0] rounded-lg bg-white hover:bg-slate-50 flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="font-mono tabular-nums">{unreadCount}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
      {renderNotifDrawer()}
    </div>
  );
};
