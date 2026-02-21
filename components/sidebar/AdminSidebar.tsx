'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { PanelLeftClose, PanelLeftOpen, LogOut, X, Menu } from 'lucide-react';
import { SidebarMenu } from './SidebarMenu';
import { MenuGroup } from './types';
import {
  DashboardIcon,
  UsersIcon,
  SettingsIcon,
  CalendarDaysIcon,
  ClipboardIcon,
  BoxesIcon,
  BoxIcon,
  WalletIcon,
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  AlertTriangleIcon,
  OfficeBuildingIcon,
  WarehouseIcon,
  ChickenIcon,
  UtensilsCrossedIcon,
  UserRoundIcon,
  ReceiptTextIcon,
  UserCogIcon,
  KeyRoundIcon,
  LockIcon,
} from './icons';

// Menu groups configuration — logic unchanged
const getAdminMenuGroups = (pendingCount: number = 0, resetRequestsCount: number = 0): MenuGroup[] => [
  {
    title: 'Menu Utama',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard/admin',
        icon: <DashboardIcon />,
      },
      {
        id: 'manajemen-karyawan',
        label: 'Manajemen Karyawan',
        icon: <UsersIcon />,
        href: '/dashboard/admin/karyawan',
      },
      {
        id: 'data-absensi',
        label: 'Riwayat Absensi',
        icon: <CalendarDaysIcon />,
        href: '/dashboard/admin/absensi',
      },
    ],
  },
  {
    title: 'Operasional',
    items: [
      {
        id: 'izin-cuti',
        label: 'Izin & Cuti',
        href: '/dashboard/admin/izin-cuti',
        icon: <ClipboardIcon />,
        badge: pendingCount > 0 ? pendingCount.toString() : undefined,
      },
      {
        id: 'inventory',
        label: 'Inventory',
        icon: <BoxesIcon />,
        children: [
          {
            id: 'master-perusahaan',
            label: 'Master Perusahaan',
            href: '/dashboard/admin/inventory/perusahaan',
            icon: <OfficeBuildingIcon className="w-4 h-4" />,
          },
          {
            id: 'jenis-daging',
            label: 'Master Jenis Daging',
            href: '/dashboard/admin/inventory/jenis-daging',
            icon: <BoxIcon className="w-4 h-4" />,
          },
          {
            id: 'barang-masuk',
            label: 'Barang Masuk',
            href: '/dashboard/admin/inventory/barang-masuk',
            icon: <ArrowDownCircleIcon className="w-4 h-4" />,
          },
          {
            id: 'ayam-mati',
            label: 'Ayam Mati',
            href: '/dashboard/admin/inventory/ayam-mati',
            icon: <AlertTriangleIcon className="w-4 h-4" />,
          },
          {
            id: 'barang-keluar',
            label: 'Barang Keluar',
            icon: <ArrowUpCircleIcon className="w-4 h-4" />,
            children: [
              {
                id: 'ayam-hidup',
                label: 'Ayam Hidup',
                href: '/dashboard/admin/inventory/barang-keluar/ayam-hidup',
                icon: <ChickenIcon className="w-4 h-4" />,
              },
              {
                id: 'daging-ayam',
                label: 'Daging Ayam',
                href: '/dashboard/admin/inventory/barang-keluar/daging',
                icon: <UtensilsCrossedIcon className="w-4 h-4" />,
              },
            ],
          },
          {
            id: 'stok-ayam',
            label: 'Stok Ayam',
            href: '/dashboard/admin/inventory/stok',
            icon: <WarehouseIcon className="w-4 h-4" />,
          },
        ],
      },
      {
        id: 'keuangan',
        label: 'Keuangan',
        icon: <WalletIcon />,
        href: '/dashboard/admin/keuangan',
      },
    ],
  },
  {
    title: 'Penjualan & Piutang',
    items: [
      {
        id: 'customer',
        label: 'Customer',
        icon: <UserRoundIcon />,
        href: '/dashboard/admin/customer',
      },
      {
        id: 'piutang',
        label: 'Piutang',
        icon: <ReceiptTextIcon />,
        href: '/dashboard/admin/piutang',
      },
    ],
  },
  {
    title: 'Sistem',
    items: [
      {
        id: 'manajemen-account',
        label: 'Manajemen Account',
        icon: <SettingsIcon />,
        badge: resetRequestsCount > 0 ? resetRequestsCount.toString() : undefined,
        children: [
          {
            id: 'daftar-akun',
            label: 'Daftar Akun',
            href: '/dashboard/admin/accounts',
            icon: <UserCogIcon className="w-4 h-4" />,
          },
          {
            id: 'permintaan-reset',
            label: 'Permintaan Reset',
            href: '/dashboard/admin/accounts/reset-requests',
            icon: <KeyRoundIcon className="w-4 h-4" />,
            badge: resetRequestsCount > 0 ? resetRequestsCount.toString() : undefined,
          },
          {
            id: 'ubah-password',
            label: 'Ubah Password',
            href: '/dashboard/admin/account/change-password',
            icon: <LockIcon className="w-4 h-4" />,
          },
        ],
      },
    ],
  },
];

interface AdminSidebarProps {
  className?: string;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ className = '' }) => {
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [resetRequestsCount, setResetRequestsCount] = useState(0);

  // Fetch pending izin/cuti count and reset requests count
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [izinRes, resetRes] = await Promise.all([
          fetch('/api/izin-cuti/pending-count', { credentials: 'include' }),
          fetch('/api/accounts/reset-requests/count', { credentials: 'include' }),
        ]);
        if (izinRes.ok) {
          const result = await izinRes.json();
          if (result.success) setPendingCount(result.data.pending_count);
        }
        if (resetRes.ok) {
          const result = await resetRes.json();
          if (result.success) setResetRequestsCount(result.count);
        }
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => { setIsMobileOpen(false); }, []);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.getElementById('admin-sidebar');
      const toggleButton = document.getElementById('sidebar-toggle');
      if (
        isMobileOpen && sidebar && !sidebar.contains(event.target as Node) &&
        toggleButton && !toggleButton.contains(event.target as Node)
      ) {
        setIsMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileOpen]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileOpen]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const sidebarContent = (
    <>
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
                <p className="text-[11px] text-gray-400 leading-tight">Admin Panel</p>
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
                onClick={() => setIsMobileOpen(false)}
                className="lg:hidden p-2 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-500 transition-all duration-200"
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5" strokeWidth={1.8} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Menu Items ── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        <SidebarMenu groups={getAdminMenuGroups(pendingCount, resetRequestsCount)} isCollapsed={isCollapsed} />
      </div>

      {/* ── Footer / Profile + Logout ── */}
      <div className="border-t border-gray-100 bg-gray-50/80">
        <div className={`flex items-center ${isCollapsed ? 'justify-center py-3' : 'gap-3 px-4 py-3'}`}>
          <div className="w-9 h-9 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm ring-2 ring-white shrink-0">
            <span className="text-white font-bold text-xs">AD</span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate leading-tight">Administrator</p>
              <p className="text-[11px] text-gray-400 leading-tight">Admin</p>
            </div>
          )}
        </div>
        <div className={`px-3 pb-3 ${isCollapsed ? 'flex justify-center' : ''}`}>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={`
              flex items-center ${isCollapsed ? 'justify-center w-10 h-10 rounded-full' : 'justify-center gap-2 w-full py-2.5 rounded-xl'} text-sm font-medium
              transition-all duration-200 ease-in-out
              ${isLoggingOut
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'text-red-500 hover:bg-red-50 hover:text-red-600'
              }
            `}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-4.5 h-4.5" strokeWidth={1.8} />
            {!isCollapsed && <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        id="sidebar-toggle"
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2.5 bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100"
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5 text-gray-600" strokeWidth={1.8} />
      </button>

      {/* Mobile Overlay */}
      <div
        className={`lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          ${isCollapsed ? 'w-20' : 'w-65'}
          bg-white shadow-xl rounded-r-2xl border-r border-gray-100
          flex flex-col
          transform transition-all duration-300 ease-in-out
          lg:transform-none
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${className}
        `}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AdminSidebar;
