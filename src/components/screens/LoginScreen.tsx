import React, { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Laptop,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserCheck,
  X
} from 'lucide-react';
import { TRANSLATIONS } from '../../i18n/translations';
import { ProcuraApiService } from '../../services/procuraApi';
import { Language, ScreenId, SupplierCategory, ThemeMode, User, UserRole } from '../../types/procurement';
import { getThemeClasses } from '../../utils/themeClasses';
import { ProcuraLogo } from '../common/ProcuraLogo';
import { LoginRoleCardsScene, PortalCardSpec } from '../three/LoginRoleCardsScene';

interface LoginScreenProps {
  theme: ThemeMode;
  lang: Language;
  onToggleTheme: () => void;
  onToggleLang: () => void;
  onAuthenticated: (user: User, targetScreen?: ScreenId) => void;
}

const PORTALS: PortalCardSpec[] = [
  {
    role: 'requester',
    index: '01',
    deptEn: 'Operations & Requisitioning',
    deptAr: 'العمليات وطلبات الشراء'
  },
  {
    role: 'officer',
    index: '02',
    deptEn: 'Strategic Sourcing',
    deptAr: 'المشتريات الاستراتيجية'
  },
  {
    role: 'manager',
    index: '03',
    deptEn: 'Executive Governance',
    deptAr: 'الاعتماد والحوكمة'
  },
  {
    role: 'supplier',
    index: '04',
    deptEn: 'External Vendor Network',
    deptAr: 'شبكة الموردين المعتمدين'
  }
];

export const LoginScreen: React.FC<LoginScreenProps> = ({
  theme,
  lang,
  onToggleTheme,
  onToggleLang,
  onAuthenticated
}) => {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const { isDark, bgMain, bgSurface, bgSubtle, textMuted, divider } = getThemeClasses(theme);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stakeholderRole, setStakeholderRole] = useState<UserRole>('requester');
  const [supplierCategory, setSupplierCategory] = useState<SupplierCategory>('tech');
  const [companyName, setCompanyName] = useState('');

  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectPortal = useCallback((role: UserRole) => {
    setSelectedRole(role);
    setStakeholderRole(role);
    setIsDrawerOpen(true);
    setAuthError('');
    setErrors({});
    window.setTimeout(() => {
      emailInputRef.current?.focus();
    }, 260);
  }, []);

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedRole(null);
    setAuthError('');
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const errs: Record<string, string> = {};

    if (!email.trim()) errs.email = t.requiredField;
    if (!password.trim()) errs.password = t.requiredField;

    if (authMode === 'register') {
      if (!name.trim()) errs.name = t.requiredField;
      if (stakeholderRole === 'supplier' && !companyName.trim()) {
        errs.companyName = t.requiredField;
      }
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      if (authMode === 'register') {
        const res = await ProcuraApiService.register({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role: stakeholderRole,
          supplierCategory: stakeholderRole === 'supplier' ? supplierCategory : undefined,
          companyName: stakeholderRole === 'supplier' ? companyName.trim() : undefined
        });
        setLoading(false);
        if (res?.user) {
          onAuthenticated(res.user);
        }
      } else {
        const res = await ProcuraApiService.login(email, password);
        setLoading(false);
        if (res?.user) {
          onAuthenticated(res.user);
        } else {
          setAuthError(t.invalidCreds);
        }
      }
    } catch (err) {
      setLoading(false);
      setAuthError(err instanceof Error ? err.message : t.invalidCreds);
    }
  };

  const activePortalRole: UserRole = selectedRole || stakeholderRole || 'requester';
  const stageShellBg = isDark ? 'bg-[#090B10] text-[#F2F3F5]' : bgMain;
  const headerControlBg = isDark
    ? 'bg-[#191C24] border-white/[0.1] text-[#F2F3F5]'
    : bgSurface;
  const drawerSurface = isDark
    ? 'bg-[#191C24] border-white/[0.12] text-[#F2F3F5] ring-1 ring-inset ring-white/[0.04]'
    : `${bgSurface} border-slate-900/[0.1]`;
  const drawerSubtle = isDark ? 'bg-[#0C0F16] border-white/[0.1]' : bgSubtle;

  return (
    <div className={`min-h-screen relative overflow-hidden flex ${stageShellBg}`}>
      {/* Background ambient focal depth */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'radial-gradient(ellipse 56% 52% at 45% 56%, rgba(227, 34, 54, 0.08) 0%, rgba(9, 11, 16, 0.94) 52%, #090B10 85%)'
              : 'radial-gradient(ellipse 60% 54% at 45% 56%, rgba(227, 34, 54, 0.05) 0%, rgba(226, 232, 240, 0.25) 45%, rgba(246, 247, 249, 0) 80%)'
          }}
        />
      </div>

      {/* Main Access Cards Stage */}
      <div
        className={`relative z-10 flex-1 flex flex-col justify-between transition-all duration-500 ease-out ${
          isDrawerOpen ? (isRtl ? 'lg:pl-[490px]' : 'lg:pr-[490px]') : ''
        }`}
      >
        {/* Header */}
        <header className={`border-b ${divider}`}>
          <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
            <ProcuraLogo theme={theme} size="md" />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onToggleLang}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${headerControlBg} hover:border-[#E32236]/60`}
              >
                <Globe className="w-3.5 h-3.5 text-[#E32236]" />
                <span>{lang === 'en' ? 'العربية' : 'English'}</span>
              </button>
              <button
                type="button"
                onClick={onToggleTheme}
                className={`p-2 rounded-lg border transition shrink-0 cursor-pointer ${headerControlBg} hover:border-[#E32236]/60`}
                aria-label="Toggle Theme"
              >
                {isDark ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-slate-700" />
                )}
              </button>
              {!isDrawerOpen && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      handleSelectPortal('requester');
                    }}
                    className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${headerControlBg} hover:border-[#E32236]/60`}
                  >
                    {t.signIn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      handleSelectPortal('requester');
                    }}
                    className="px-4 py-1.5 rounded-lg bg-[#E32236] hover:bg-[#C81B2D] text-white text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {t.tabRegister}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Editorial Headline + Interactive 3D Portal Cards */}
        <main className="flex-1 flex flex-col justify-center py-6 lg:py-8">
          <div className="max-w-7xl w-full mx-auto px-6 lg:px-8 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-[#E32236]">
                {t.brandSubtitle}
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight leading-[1.12] text-balance max-w-2xl">
                {t.loginHeroTitle}
              </h1>
              <p className={`text-sm leading-relaxed max-w-xl ${textMuted}`}>{t.loginHeroSub}</p>
            </div>

            <div className="relative">
              <LoginRoleCardsScene
                theme={theme}
                lang={lang}
                portals={PORTALS}
                selectedRole={selectedRole}
                onSelectRole={(role) => {
                  setStakeholderRole(role);
                  handleSelectPortal(role);
                }}
                liveEmail={email}
                livePassword={password}
                showPwd={showPwd}
              />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className={`border-t ${divider}`}>
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className={textMuted}>© 2026 PROCURA Enterprise Sourcing</span>
            <span className={textMuted}>
              {isRtl ? 'اختر بوابة الوصول أو سجل حساباً جديداً للمتابعة' : 'Select a portal pass or register to continue'}
            </span>
          </div>
        </footer>
      </div>

      {/* Slide-Out Sign-In / Register Drawer */}
      <aside
        className={`fixed top-0 bottom-0 ${
          isRtl ? 'left-0 border-r' : 'right-0 border-l'
        } z-30 w-full sm:w-[490px] p-6 sm:p-8 shadow-2xl flex flex-col justify-between transition-transform duration-500 ease-out ${drawerSurface} ${
          isDrawerOpen
            ? 'translate-x-0 pointer-events-auto'
            : isRtl
            ? '-translate-x-full pointer-events-none'
            : 'translate-x-full pointer-events-none'
        }`}
        aria-hidden={!isDrawerOpen}
      >
        <div className="overflow-y-auto pr-1">
          {/* Top Bar with Mode Switch */}
          <div className={`flex items-center justify-between pb-4 mb-5 border-b ${divider}`}>
            <div className={`flex items-center p-1 rounded-lg border ${drawerSubtle}`}>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setErrors({});
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#E32236] text-white shadow-xs'
                    : `${textMuted} hover:text-current`
                }`}
              >
                {t.tabSignIn}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                  setErrors({});
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-[#E32236] text-white shadow-xs'
                    : `${textMuted} hover:text-current`
                }`}
              >
                {t.tabRegister}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCloseDrawer}
              className={`p-2 rounded-lg border transition shrink-0 cursor-pointer ${drawerSubtle} hover:border-[#E32236]/50 hover:text-[#E32236]`}
              aria-label={t.cancel}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Headline */}
          <div className="mb-5">
            <h2 className="text-2xl font-bold tracking-tight">
              {authMode === 'login' ? t.welcomeBack : t.tabRegister}
            </h2>
            <p className={`text-xs mt-1 leading-relaxed ${textMuted}`}>
              {authMode === 'login' ? t.signInSub : t.stakeholderSubtitle}
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-[#E32236]/10 border border-[#E32236]/30 text-[#E32236] text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name in Register mode */}
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-semibold mb-1.5">{t.fullName}</label>
                <input
                  type="text"
                  value={name}
                  placeholder={t.fullNamePlaceholder}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition focus:border-[#E32236] ${drawerSubtle}`}
                />
                {errors.name && <p className="text-xs text-[#E32236] mt-1">{errors.name}</p>}
              </div>
            )}

            {/* Email / Gmail */}
            <div>
              <label className="block text-xs font-semibold mb-1.5">{t.email}</label>
              <input
                ref={emailInputRef}
                type="email"
                value={email}
                placeholder="you@gmail.com or name@company.io"
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition focus:border-[#E32236] ${drawerSubtle}`}
              />
              {errors.email && <p className="text-xs text-[#E32236] mt-1">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold mb-1.5">{t.password}</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  placeholder={t.passwordPlaceholder}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition focus:border-[#E32236] ${drawerSubtle}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className={`absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'left-3' : 'right-3'
                  } ${textMuted} hover:text-[#E32236] cursor-pointer`}
                  aria-label="Toggle password visibility"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-[#E32236] mt-1">{errors.password}</p>
              )}
            </div>

            {/* STAKEHOLDER SELECTION RADIO BUTTONS (Exclusive choice of 1 of 4) */}
            {authMode === 'register' && (
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-bold text-[#E32236]">
                  {t.stakeholderTitle}
                </label>
                <p className={`text-[11px] ${textMuted}`}>{t.stakeholderSubtitle}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    [
                      { role: 'requester', label: t.role_requester, desc: 'Requisition drafting' },
                      { role: 'officer', label: t.role_officer, desc: 'Tenders & AI evaluation' },
                      { role: 'manager', label: t.role_manager, desc: 'Executive authorization' },
                      { role: 'supplier', label: t.role_supplier, desc: 'External commercial bids' }
                    ] as const
                  ).map((item) => {
                    const isSelected = stakeholderRole === item.role;
                    return (
                      <label
                        key={item.role}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border transition cursor-pointer ${
                          isSelected
                            ? 'border-[#E32236] bg-[#E32236]/10 ring-1 ring-[#E32236]'
                            : `${drawerSubtle} hover:border-[#E32236]/40`
                        }`}
                      >
                        <input
                          type="radio"
                          name="stakeholderRole"
                          value={item.role}
                          checked={isSelected}
                          onChange={() => {
                            setStakeholderRole(item.role);
                            setSelectedRole(item.role);
                          }}
                          className="mt-1 accent-[#E32236]"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold leading-tight">{item.label}</div>
                          <div className={`text-[10px] mt-0.5 ${textMuted}`}>{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* IF SUPPLIER: 2 RADIO BUTTONS (Tech vs Furniture) + Company Name */}
            {authMode === 'register' && stakeholderRole === 'supplier' && (
              <div className={`p-4 rounded-xl border border-[#E32236]/30 bg-[#E32236]/5 space-y-3.5`}>
                <div>
                  <label className="block text-xs font-bold text-[#E32236] mb-1">
                    {t.supplierCategoryTitle}
                  </label>
                  <p className={`text-[11px] mb-2.5 ${textMuted}`}>{t.supplierCategorySubtitle}</p>

                  <div className="grid grid-cols-1 gap-2">
                    {/* Tech Supplier Radio */}
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border transition cursor-pointer ${
                        supplierCategory === 'tech'
                          ? 'border-[#E32236] bg-white dark:bg-[#191C24] shadow-xs ring-1 ring-[#E32236]'
                          : 'border-white/10 dark:border-white/10 bg-black/5 dark:bg-black/20 hover:border-[#E32236]/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="supplierCategory"
                        value="tech"
                        checked={supplierCategory === 'tech'}
                        onChange={() => setSupplierCategory('tech')}
                        className="mt-1 accent-[#E32236]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <Laptop className="w-3.5 h-3.5 text-[#E32236]" />
                          <span>{t.supplierCategoryTech}</span>
                        </div>
                        <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                          {t.supplierCategoryTechSub}
                        </div>
                      </div>
                    </label>

                    {/* Furniture Supplier Radio */}
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border transition cursor-pointer ${
                        supplierCategory === 'furniture'
                          ? 'border-[#E32236] bg-white dark:bg-[#191C24] shadow-xs ring-1 ring-[#E32236]'
                          : 'border-white/10 dark:border-white/10 bg-black/5 dark:bg-black/20 hover:border-[#E32236]/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="supplierCategory"
                        value="furniture"
                        checked={supplierCategory === 'furniture'}
                        onChange={() => setSupplierCategory('furniture')}
                        className="mt-1 accent-[#E32236]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <Building2 className="w-3.5 h-3.5 text-[#E32236]" />
                          <span>{t.supplierCategoryFurniture}</span>
                        </div>
                        <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                          {t.supplierCategoryFurnitureSub}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">{t.companyName}</label>
                  <input
                    type="text"
                    value={companyName}
                    placeholder={t.companyNamePlaceholder}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition focus:border-[#E32236] bg-white dark:bg-[#12151D]`}
                  />
                  {errors.companyName && (
                    <p className="text-xs text-[#E32236] mt-1">{errors.companyName}</p>
                  )}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#E32236] hover:bg-[#C81B2D] text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60 mt-3 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{authMode === 'register' ? t.creatingAccount : t.signingIn}</span>
                </>
              ) : (
                <>
                  <span>{authMode === 'register' ? t.createAccountBtn : t.signIn}</span>
                  {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </>
              )}
            </button>

            {/* Toggle Sign In / Register footnote link */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                  setErrors({});
                }}
                className={`text-xs ${textMuted} hover:text-[#E32236] cursor-pointer`}
              >
                {authMode === 'login'
                  ? `${t.dontHaveAccount} ${t.tabRegister}`
                  : `${t.alreadyHaveAccount} ${t.tabSignIn}`}
              </button>
            </div>
          </form>
        </div>

        <div className={`pt-4 border-t ${divider} text-[11px] ${textMuted} flex items-center justify-between`}>
          <span>
            {isRtl
              ? 'نظام مشتريات مؤمن بصلاحيات مؤسسية.'
              : 'Protected by enterprise role-based governance.'}
          </span>
          <span className="font-mono-code text-[#E32236] font-bold">2026.11</span>
        </div>
      </aside>
    </div>
  );
};
