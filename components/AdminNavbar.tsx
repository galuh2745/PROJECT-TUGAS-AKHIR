'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Calendar, User, LogOut, KeyRound, Bell } from 'lucide-react';

// ── Breadcrumb label mapping ────────────────────────────────────────────────
const labelMap: Record<string, string> = {
  dashboard: 'Dashboard',
  admin: 'Admin',
  karyawan: 'Manajemen Karyawan',
  absensi: 'Riwayat Absensi',
  'izin-cuti': 'Izin & Cuti',
  inventory: 'Inventory',
  perusahaan: 'Master Perusahaan',
  'jenis-daging': 'Master Jenis Daging',
  'barang-masuk': 'Barang Masuk',
  'barang-keluar': 'Barang Keluar',
  'ayam-hidup': 'Ayam Hidup',
  daging: 'Daging Ayam',
  'ayam-mati': 'Ayam Mati',
  stok: 'Stok Ayam',
  keuangan: 'Keuangan',
  accounts: 'Daftar Akun',
  account: 'Akun',
  'reset-requests': 'Permintaan Reset',
  'change-password': 'Ubah Password',
  penjualan: 'Penjualan',
  draft: 'Transaksi Draft',
  piutang: 'Piutang',
  customer: 'Customer',
};

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  // Remove 'dashboard' and 'admin' prefix for cleaner display
  const displaySegments = segments.slice(2); // skip 'dashboard/admin'
  if (displaySegments.length === 0) return [{ label: 'Dashboard', href: '/dashboard/admin' }];

  return displaySegments.map((seg, idx) => {
    const href = '/' + segments.slice(0, idx + 3).join('/');
    const label = labelMap[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
    return { label, href };
  });
}

function getPageTitle(pathname: string): string {
  const crumbs = getBreadcrumbs(pathname);
  return crumbs[crumbs.length - 1]?.label || 'Dashboard';
}

function formatDate(): string {
  const now = new Date();
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

interface ResetRequestInfo {
  id: string;
  nama: string;
}

export default function AdminNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [todayDate, setTodayDate] = useState('');
  const [belumAbsen, setBelumAbsen] = useState(0);
  const [totalKaryawan, setTotalKaryawan] = useState(0);
  const [resetRequests, setResetRequests] = useState<ResetRequestInfo[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const hasNotifications = belumAbsen > 0 || resetRequests.length > 0 || draftCount > 0;

  useEffect(() => {
    setTodayDate(formatDate());
    // Fetch notification counts
    const fetchNotifs = async () => {
      try {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const [dashRes, resetRes, draftRes] = await Promise.all([
          fetch(`/api/dashboard/admin?tanggal=${dateStr}`, { credentials: 'include' }),
          fetch('/api/accounts/reset-requests', { credentials: 'include' }),
          fetch('/api/penjualan/draft/count', { credentials: 'include' }),
        ]);
        if (dashRes.ok) {
          const json = await dashRes.json();
          if (json.success) {
            const ringkasan = json.data?.ringkasan;
            const total = ringkasan?.total_karyawan_aktif || 0;
            const hadir = ringkasan?.jumlah_hadir_hari_ini || 0;
            const izinCuti = ringkasan?.jumlah_izin_cuti_hari_ini || 0;
            setTotalKaryawan(total);
            setBelumAbsen(Math.max(0, total - hadir - izinCuti));
          }
        }
        if (resetRes.ok) {
          const json = await resetRes.json();
          if (json.success && json.data) {
            const names: ResetRequestInfo[] = json.data.map((r: { id: string; karyawan?: { nama?: string }; name?: string }) => ({
              id: r.id,
              nama: r.karyawan?.nama || r.name || 'Unknown',
            }));
            setResetRequests(names);
          }
        }
        if (draftRes.ok) {
          const json = await draftRes.json();
          if (json.success) setDraftCount(json.count || 0);
        }
      } catch { /* ignore */ }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
  };

  const crumbs = getBreadcrumbs(pathname);
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        {/* Left: Page title + breadcrumb */}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-800 truncate leading-tight">
            {pageTitle}
          </h2>
          <nav className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
            <span className="hover:text-gray-600 cursor-default">Admin</span>
            {crumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                {idx === crumbs.length - 1 ? (
                  <span className="text-gray-600 font-medium truncate">{crumb.label}</span>
                ) : (
                  <span className="hover:text-gray-600 cursor-default truncate">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Right: Date + Avatar */}
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {/* Date */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{todayDate}</span>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-6 bg-gray-200" />

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(!notifOpen); setDropdownOpen(false); }}
              className="relative p-2 rounded-lg hover:bg-gray-100/80 transition-colors duration-150"
            >
              <Bell className={`w-5 h-5 text-gray-500 ${hasNotifications ? 'animate-bell-shake' : ''}`} />
              {hasNotifications && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-dot-pulse" />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-white rounded-lg shadow-lg border border-gray-200/80 py-2 animate-in fade-in slide-in-from-top-1 duration-150 z-50 max-h-96 overflow-y-auto">
                <div className="px-3 py-1.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800">Notifikasi</p>
                </div>
                <div className="py-1">
                  {/* Draft Notifications */}
                  {draftCount > 0 && (
                    <div
                      className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => { setNotifOpen(false); router.push('/dashboard/admin/penjualan/draft'); }}
                    >
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-orange-600 text-xs font-bold">{draftCount}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Transaksi Draft</p>
                        <p className="text-xs text-gray-400">{draftCount} transaksi menunggu finalisasi & cetak</p>
                      </div>
                    </div>
                  )}

                  {/* Absensi: Karyawan Belum Absen */}
                  {belumAbsen > 0 && (
                    <div
                      className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => { setNotifOpen(false); router.push('/dashboard/admin/absensi'); }}
                    >
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-red-600 text-xs font-bold">{belumAbsen}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Karyawan Belum Absen</p>
                        <p className="text-xs text-gray-400">{belumAbsen} dari {totalKaryawan} karyawan belum absen hari ini</p>
                      </div>
                    </div>
                  )}

                  {/* Reset Password Requests - Individual Names */}
                  {resetRequests.length > 0 && (
                    <div
                      className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => { setNotifOpen(false); router.push('/dashboard/admin/accounts/reset-requests'); }}
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-amber-600 text-xs font-bold">{resetRequests.length}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Permintaan Reset Password</p>
                        {resetRequests.map((req) => (
                          <p key={req.id} className="text-xs text-gray-500">
                            Permintaan reset password <span className="font-medium text-gray-700">{req.nama}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasNotifications && (
                    <div className="px-3 py-4 text-center text-sm text-gray-400">Tidak ada notifikasi</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100/80 transition-colors duration-150"
            >
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <span className="text-white text-xs font-bold">AD</span>
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-medium text-gray-700 leading-tight">Administrator</p>
                <p className="text-[10px] text-gray-400 leading-tight">Admin</p>
              </div>
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-lg shadow-lg border border-gray-200/80 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => { setDropdownOpen(false); router.push('/dashboard/admin/account/change-password'); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-gray-400" />
                  <span>Ubah Password</span>
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
