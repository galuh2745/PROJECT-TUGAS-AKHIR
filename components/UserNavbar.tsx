'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronRight, Calendar, LogOut, KeyRound } from 'lucide-react';

const labelMap: Record<string, string> = {
  user: 'Beranda',
  'izin-cuti': 'Izin & Cuti',
  riwayat: 'Riwayat Absensi',
  akun: 'Akun Saya',
};

function getPageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last === 'user') return 'Absensi';
  return labelMap[last] || last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ');
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

interface UserInfo {
  nama: string;
  initial: string;
  foto_profil: string | null;
}

export default function UserNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [todayDate, setTodayDate] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo>({ nama: 'User', initial: 'U', foto_profil: null });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTodayDate(formatDate());
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            const nama = data.user.karyawan?.nama || data.user.name || 'User';
            setUserInfo({ nama, initial: nama.charAt(0).toUpperCase(), foto_profil: data.user.karyawan?.foto_profil || null });
          }
        }
      } catch {}
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
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

  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        {/* Left: Page title */}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-800 truncate leading-tight">
            {pageTitle}
          </h2>
        </div>

        {/* Right: Date + Avatar */}
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{todayDate}</span>
          </div>
          <div className="hidden md:block w-px h-6 bg-gray-200" />

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100/80 transition-colors duration-150"
            >
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm overflow-hidden">
                {userInfo.foto_profil ? (
                  <Image src={userInfo.foto_profil} alt="Foto" width={32} height={32} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <span className="text-white text-xs font-bold">{userInfo.initial}</span>
                )}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-medium text-gray-700 leading-tight truncate max-w-30">{userInfo.nama}</p>
                <p className="text-[10px] text-gray-400 leading-tight">Karyawan</p>
              </div>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-lg shadow-lg border border-gray-200/80 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => { setDropdownOpen(false); router.push('/dashboard/user/akun'); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-gray-400" />
                  <span>Akun Saya</span>
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
