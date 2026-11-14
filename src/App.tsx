import React from 'react';
import { AppShell } from './components/AppShell';
import { AuthGateView } from './components/AuthGateView';
import { ImportCenter } from './components/ImportCenter';
import { MasterWOTable } from './components/MasterWOTable';
import { RoleDashboards } from './components/RoleDashboards';
import {
  CoordinationCenterView,
  InstallerProfileView,
  ManagementStaffView,
  ReportQueueView,
  SystemSettingsView,
} from './components/StaffAndAdminModules';
import { TicketFullview } from './components/TicketFullview';
import { NexusProvider, useNexus } from './context/NexusContext';

const NexusWorkspace: React.FC = () => {
  const { authState, activeRoute } = useNexus();

  if (authState !== 'authenticated') {
    return <AuthGateView />;
  }

  return (
    <AppShell>
      {activeRoute === 'dashboard' && <RoleDashboards />}
      {(activeRoute === 'tickets' || activeRoute === 'my_tickets') && (
        <MasterWOTable />
      )}
      {activeRoute === 'ticket_fullview' && <TicketFullview />}
      {(activeRoute === 'report' || activeRoute === 'reports') && (
        <ReportQueueView />
      )}
      {activeRoute === 'management_staff' && <ManagementStaffView />}
      {activeRoute === 'import' && <ImportCenter />}
      {(activeRoute === 'coordination_center' ||
        activeRoute === 'coordination') && <CoordinationCenterView />}
      {activeRoute === 'profile' && <InstallerProfileView />}
      {activeRoute === 'system_settings' && <SystemSettingsView />}
    </AppShell>
  );
};

export default function App() {
  return (
    <NexusProvider>
      <NexusWorkspace />
    </NexusProvider>
  );
}
