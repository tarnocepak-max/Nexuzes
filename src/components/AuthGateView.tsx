import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Globe,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { getSupabaseClient } from '../lib/supabase';
import { NexusService } from '../services/nexusService';

export const AuthGateView: React.FC = () => {
  const {
    authState,
    language,
    setLanguage,
    t,
    publicConfig,
    bootstrapStatus,
    refreshAuthAndBootstrap,
  } = useNexus();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client is not configured');
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      await refreshAuthAndBootstrap();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await NexusService.bootstrapSuperAdmin({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
      });
      setSuccessMsg(
        language === 'id'
          ? 'Super Admin berhasil diinisialisasi dan bootstrap dikunci permanen. Silakan masuk.'
          : 'Super Admin initialized and bootstrap permanently locked. Please sign in.',
      );
      setPassword('');
      await refreshAuthAndBootstrap();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <div className="w-10 h-10 rounded-lg bg-[#7C3AED]/10 text-[#7C3AED] flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            {language === 'id' ? 'Memuat sesi NexusOps...' : 'Loading NexusOps session...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-8">
      {/* Top minimal utility header */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4 py-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#7C3AED] text-white flex items-center justify-center font-display font-bold text-base">
            N
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-slate-900">
            NexusOps
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-lg">
          <Globe className="w-3.5 h-3.5 text-slate-500 ml-2 mr-1" />
          <button
            type="button"
            onClick={() => setLanguage('id')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              language === 'id'
                ? 'bg-[#7C3AED] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ID
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              language === 'en'
                ? 'bg-[#7C3AED] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            EN
          </button>
        </div>
      </header>

      {/* Main Centered Auth / Setup Workspace */}
      <main className="max-w-5xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Operational Context Column */}
        <section className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-[#7C3AED] tracking-wide mb-3">
              Field Workforce & Contractor Operations
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mb-4">
              {language === 'id'
                ? 'Satu Master Work Order dari Import hingga Final Closing'
                : 'One Master Work Order from Import to Final Closing'}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-8">
              {language === 'id'
                ? 'Setiap peran bekerja pada sumber data Work Order yang sama dengan isolasi hak akses berbasis Supabase PostgreSQL Row Level Security (RLS).'
                : 'All four operational roles collaborate on a single Master Work Order record enforced by Supabase PostgreSQL Row Level Security (RLS).'}
            </p>
          </div>

          <div className="space-y-3 border-t border-[#E2E8F0] pt-6">
            <div className="flex items-center justify-between text-xs py-1.5">
              <span className="font-semibold text-[#6D28D9]">Super Admin</span>
              <span className="text-slate-500">
                17 System Config Modules · Read-Only Batch Monitoring
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-t border-slate-100">
              <span className="font-semibold text-[#2563EB]">Dispatch</span>
              <span className="text-slate-500">
                Import · Material Approval · Report Review · Final Closing
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-t border-slate-100">
              <span className="font-semibold text-[#0D9488]">Leader / Korlap</span>
              <span className="text-slate-500">
                Vendor-Scoped Queue · Assign/Reassign · Add Installer
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-t border-slate-100">
              <span className="font-semibold text-[#D97706]">Installer / Technician</span>
              <span className="text-slate-500">
                PROGRESS Check-in · Evidence · Technical Report Check-out
              </span>
            </div>
          </div>
        </section>

        {/* Right Interactive Auth / Bootstrap / Environment Check Card */}
        <section className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-8 flex flex-col justify-center">
          {(authState === 'env_missing' || authState === 'schema_missing') && (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-[#D97706] flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    {t('env_missing_title')}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">{t('env_missing_desc')}</p>
                </div>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 space-y-2.5 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">
                  {language === 'id'
                    ? 'Checklist Konfigurasi Supabase Free Plan:'
                    : 'Supabase Free Plan Setup Checklist:'}
                </p>
                <div className="flex items-center justify-between">
                  <span>1. Environment Secrets</span>
                  <span className="font-mono text-slate-600">
                    {publicConfig?.missingEnv?.length
                      ? `Missing: ${publicConfig.missingEnv.join(', ')}`
                      : 'Configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                  <span>2. PostgreSQL Schema & RLS</span>
                  <span className="font-mono text-slate-600">
                    {bootstrapStatus?.schemaReady
                      ? 'Ready'
                      : 'Run supabase/schema.sql in Supabase SQL Editor'}
                  </span>
                </div>
                {bootstrapStatus?.schemaError && (
                  <p className="text-[11px] font-mono text-red-600 pt-1">
                    {bootstrapStatus.schemaError}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void refreshAuthAndBootstrap()}
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>
                  {language === 'id' ? 'Periksa Koneksi Ulang' : 'Re-check Supabase Connection'}
                </span>
              </button>
            </div>
          )}

          {authState === 'needs_bootstrap' && (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-[#6D28D9]/10 text-[#6D28D9] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    {t('bootstrap_title')}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {t('bootstrap_subtitle')}
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t('bootstrap_full_name')}
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama Lengkap Admin"
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    {t('auth_email')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    {t('bootstrap_phone')}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+62812..."
                    className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t('auth_password')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 karakter"
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#6D28D9] hover:bg-[#5B21B6] disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{submitting ? t('bootstrap_creating') : t('bootstrap_submit')}</span>
              </button>
            </form>
          )}

          {authState === 'unauthenticated' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  {t('auth_title')}
                </h2>
                <p className="text-xs text-slate-500 mt-1">{t('auth_subtitle')}</p>
              </div>

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                  {successMsg}
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t('auth_email')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@perusahaan.com"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t('auth_password')}
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>{submitting ? t('auth_signing_in') : t('auth_submit')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </section>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-xs text-slate-400 flex items-center justify-between py-2">
        <span>NexusOps Work Order Management System</span>
        <span>Supabase PostgreSQL · Auth · Storage · RLS</span>
      </footer>
    </div>
  );
};
