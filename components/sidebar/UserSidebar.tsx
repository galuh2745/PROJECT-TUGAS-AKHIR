'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Clock, ClipboardList, History, User, LogOut, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface UserInfo {
  nama: string;
  nip: string;
  jenis_karyawan: string;
  foto_profil: string | null;
}

// ─── Tooltip for collapsed mode ─────────────────────────────────────────────
const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
      {label}
      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
    </div>
  </div>
);

export default function UserSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            const karyawan = data.user.karyawan;
            setUserInfo({
              nama: karyawan?.nama || data.user.name || 'User',
              nip: karyawan?.nip || '-',
              jenis_karyawan: karyawan?.jenis_karyawan?.nama_jenis || 'Karyawan',
              foto_profil: karyawan?.foto_profil || null,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };
    fetchUserInfo();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const menuItems = [
    { name: 'Absensi', href: '/dashboard/user', icon: <Clock className="w-5 h-5" strokeWidth={1.8} />, description: 'Absen masuk & pulang' },
    { name: 'Izin & Cuti', href: '/dashboard/user/izin-cuti', icon: <ClipboardList className="w-5 h-5" strokeWidth={1.8} />, description: 'Ajukan izin atau cuti' },
    { name: 'Riwayat Absensi', href: '/dashboard/user/riwayat', icon: <History className="w-5 h-5" strokeWidth={1.8} />, description: 'Lihat riwayat kehadiran' },
    { name: 'Akun Saya', href: '/dashboard/user/akun', icon: <User className="w-5 h-5" strokeWidth={1.8} />, description: 'Pengaturan akun' },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard/user') return pathname === '/dashboard/user';
    return pathname.startsWith(href);
  };

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-100 z-40 shadow-sm">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center shadow-sm ring-1 ring-gray-100">
              <Image src="/images/logo/logocvaswihd.png" alt="Logo" width={32} height={32} className="object-contain" />
            </div>
            <span className="font-semibold text-sm text-gray-800">Portal Karyawan</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-gray-500" strokeWidth={1.8} /> : <Menu className="w-5 h-5 text-gray-500" strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <div
        className={`lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50
          ${isCollapsed ? 'w-20' : 'w-65'}
          bg-white shadow-xl rounded-r-2xl border-r border-gray-100
          transition-all duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* ── Header / Logo + Toggle ── */}
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-4 py-4 border-b border-gray-100`}>
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center shadow-sm ring-1 ring-gray-100">
                  <Image src="/images/logo/logocvaswihd.png" alt="Logo" width={40} height={40} className="object-contain" />
                </div>
                <button
                  onClick={() => setIsCollapsed(false)}
                  className="p-2 rounded-full bg-gray-100 hover:bg-blue-100 hover:text-blue-600 text-gray-500 transition-all duration-200 shadow-sm"
                  title="Perluas sidebar"
                >
                  <PanelLeftOpen className="w-5 h-5" strokeWidth={1.8} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center shadow-sm ring-1 ring-gray-100 shrink-0">
                    <Image src="/images/logo/logocvaswihd.png" alt="Logo" width={40} height={40} className="object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-sm font-bold text-gray-800 truncate leading-tight">CV Aswi Sentosa</h1>
                    <p className="text-[11px] text-gray-400 leading-tight">Portal Karyawan</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsCollapsed(true)}
                    className="hidden lg:flex p-2 rounded-full bg-gray-100 hover:bg-blue-100 hover:text-blue-600 text-gray-500 transition-all duration-200 shadow-sm"
                    title="Kecilkan sidebar"
                  >
                    <PanelLeftClose className="w-5 h-5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="lg:hidden p-2 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-500 transition-all duration-200"
                    aria-label="Close sidebar"
                  >
                    <X className="w-5 h-5" strokeWidth={1.8} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── User Info ── */}
          {userInfo && (
            <div className={`border-b border-gray-100 ${isCollapsed ? 'py-3 flex flex-col items-center' : 'px-4 py-4'}`}>
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                {userInfo.foto_profil ? (
                  <div className="w-9 h-9 rounded-full overflow-hidden shadow-sm ring-2 ring-white shrink-0">
                    <Image src={userInfo.foto_profil} alt="Foto" width={36} height={36} className="w-full h-full object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm ring-2 ring-white shrink-0">
                    <span className="text-white font-bold text-xs">
                      {userInfo.nama.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate leading-tight">{userInfo.nama}</p>
                    <p className="text-[11px] text-gray-400 leading-tight">{userInfo.nip}</p>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600">
                    {userInfo.jenis_karyawan}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Navigation ── */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {!isCollapsed && (
              <div className="px-4 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Menu</span>
              </div>
            )}
            <div className="space-y-1">
              {menuItems.map((item) => {
                const active = isActive(item.href);

                if (isCollapsed) {
                  return (
                    <Tooltip key={item.href} label={item.name}>
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`
                          flex items-center justify-center w-10 h-10 mx-auto rounded-xl
                          transition-all duration-200
                          ${active
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'
                          }
                        `}
                      >
                        <span className={active ? 'text-white' : ''}>{item.icon}</span>
                      </Link>
                    </Tooltip>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl text-sm
                      transition-all duration-200 ease-in-out group
                      ${active
                        ? 'bg-blue-600 text-white font-semibold shadow-md'
                        : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                      }
                    `}
                  >
                    <span className={`shrink-0 transition-all duration-200 group-hover:scale-110 ${active ? 'text-white' : 'text-gray-500 group-hover:text-blue-600'}`}>
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="leading-tight truncate">{item.name}</p>
                      <p className={`text-[11px] leading-tight mt-0.5 truncate ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                        {item.description}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* ── Logout ── */}
          <div className="border-t border-gray-100 bg-gray-50/80 px-3 py-3">
            <button
              onClick={handleLogout}
              className={`
                flex items-center ${isCollapsed ? 'justify-center w-10 h-10 mx-auto rounded-full' : 'justify-center gap-2 w-full py-2.5 rounded-xl'} text-sm font-medium
                text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200
              `}
              title={isCollapsed ? 'Keluar' : undefined}
            >
              <LogOut className="w-4.5 h-4.5" strokeWidth={1.8} />
              {!isCollapsed && <span>Keluar</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
