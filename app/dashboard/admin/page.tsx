'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Users, CheckCircle, CalendarDays, UserX,
  PackagePlus, PackageMinus, Skull, Warehouse,
  TrendingUp, TrendingDown, Wallet,
  RefreshCw, BarChart3, LineChart as LineChartIcon,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, Area, AreaChart,
} from 'recharts';

// ── Types ───────────────────────────────────────────────────────────────────
interface SummaryData {
  tanggal: string;
  absensi: {
    total_karyawan: number;
    hadir: number;
    izin: number;
    alpha: number;
  };
  inventory: {
    ayam_masuk: number;
    ayam_keluar: number;
    ayam_mati: number;
    stok_tersisa: number;
  };
  keuangan: {
    pemasukan: number;
    pengeluaran: number;
    saldo: number;
  };
}

interface KeuanganChartPoint {
  tanggal: string;
  Pemasukan: number;
  Pengeluaran: number;
  Saldo: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function getLocalDateStr(date?: Date) {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatTanggalIndonesia(dateStr: string) {
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const d = new Date(dateStr + 'T00:00:00');
  return `${hari[d.getDay()]}, ${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

function formatBulanIndonesia(monthStr: string) {
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const [year, month] = monthStr.split('-').map(Number);
  return `${bulan[month - 1]} ${year}`;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatRupiahShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} rb`;
  return n.toString();
}

// ── Custom Tooltips ─────────────────────────────────────────────────────────
function KeuanganTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{formatRupiah(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  // Keuangan chart
  const [keuanganChart, setKeuanganChart] = useState<KeuanganChartPoint[]>([]);
  const [keuanganLoading, setKeuanganLoading] = useState(true);

  const todayStr = getLocalDateStr();
  const currentMonth = getCurrentMonth();

  // ── Fetch today's summary ──
  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard/admin/summary?date=${todayStr}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { router.push('/login'); return; }
        throw new Error('Fetch failed');
      }
      const json = await res.json();
      if (json.success) setData(json.data);
      else toast.error(json.error || 'Gagal memuat data');
    } catch {
      toast.error('Gagal memuat data dashboard');
    } finally {
      setLoading(false);
    }
  }, [todayStr, router]);

  // ── Fetch keuangan bulanan chart ──
  const fetchKeuanganChart = useCallback(async () => {
    try {
      setKeuanganLoading(true);
      const res = await fetch(`/api/keuangan/bulanan?month=${currentMonth}`, { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data?.rekap_harian) {
        const chartData: KeuanganChartPoint[] = json.data.rekap_harian.map(
          (item: { tanggal: string; pemasukan: number; pengeluaran: number; saldo: number }) => {
            const d = new Date(item.tanggal + 'T00:00:00');
            return {
              tanggal: `${d.getDate()}/${d.getMonth() + 1}`,
              Pemasukan: item.pemasukan,
              Pengeluaran: item.pengeluaran,
              Saldo: item.saldo,
            };
          },
        );
        setKeuanganChart(chartData);
      }
    } catch {
      // Silent fail
    } finally {
      setKeuanganLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchKeuanganChart(); }, [fetchKeuanganChart]);

  if (loading) return <LoadingSpinner text="Memuat dashboard..." />;

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="text-center space-y-4">
          <p className="text-gray-500">Gagal memuat data dashboard</p>
          <button onClick={fetchSummary} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const { absensi, inventory, keuangan } = data;

  // ── Card definitions ──
  const absensiCards = [
    { label: 'Total Karyawan', value: absensi.total_karyawan, icon: Users, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
    { label: 'Hadir Hari Ini', value: absensi.hadir, icon: CheckCircle, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    { label: 'Izin / Cuti', value: absensi.izin, icon: CalendarDays, iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
    { label: 'Alpha', value: absensi.alpha, icon: UserX, iconBg: 'bg-red-100', iconColor: 'text-red-600' },
  ];

  const inventoryCards = [
    { label: 'Ayam Masuk', value: `${inventory.ayam_masuk.toLocaleString('id-ID')} ekor`, icon: PackagePlus, iconBg: 'bg-sky-100', iconColor: 'text-sky-600' },
    { label: 'Ayam Keluar', value: `${inventory.ayam_keluar.toLocaleString('id-ID')} ekor`, icon: PackageMinus, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
    { label: 'Ayam Mati', value: `${inventory.ayam_mati.toLocaleString('id-ID')} ekor`, icon: Skull, iconBg: 'bg-rose-100', iconColor: 'text-rose-600' },
    { label: 'Stok Tersisa', value: `${inventory.stok_tersisa.toLocaleString('id-ID')} ekor`, icon: Warehouse, iconBg: 'bg-teal-100', iconColor: 'text-teal-600' },
  ];

  const keuanganCards = [
    { label: 'Total Pemasukan', value: formatRupiah(keuangan.pemasukan), icon: TrendingUp, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    { label: 'Total Pengeluaran', value: formatRupiah(keuangan.pengeluaran), icon: TrendingDown, iconBg: 'bg-red-100', iconColor: 'text-red-600' },
    { label: 'Saldo Bersih', value: formatRupiah(keuangan.saldo), icon: Wallet, iconBg: keuangan.saldo >= 0 ? 'bg-blue-100' : 'bg-red-100', iconColor: keuangan.saldo >= 0 ? 'text-blue-600' : 'text-red-600' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ═══════════════════════════════════════════════════
          GREETING CARD
         ═══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-blue-600 via-blue-700 to-indigo-800 text-white p-6 sm:p-8 shadow-lg">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute -right-6 -bottom-6 w-40 h-40 rounded-full bg-white/5 blur-xl" />

        <div className="relative flex items-center justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Halo, Admin 😁
            </h1>
            <p className="text-blue-100 text-sm sm:text-base max-w-md">
              Selamat datang di Sistem Absensi,Inventory, & Keuangan CV Aswi Sentosa Lampung
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs sm:text-sm font-medium">
                <CalendarDays className="w-3.5 h-3.5" />
                {formatTanggalIndonesia(data.tanggal)}
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center">
            <div className="w-36 h-36 relative">
              <img
                src="/images/logo/Shopaholics - Avatar.png"
                alt="Admin Avatar"
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          RINGKASAN ABSENSI HARIAN
         ═══════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400 mb-3 px-1">
          Ringkasan Absensi Harian
        </h2>
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {absensiCards.map((c) => (
            <StaggerItem key={c.label}>
              <SummaryCard {...c} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ═══════════════════════════════════════════════════
          RINGKASAN INVENTORY HARIAN
         ═══════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400 mb-3 px-1">
          Ringkasan Inventory Harian
        </h2>
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {inventoryCards.map((c) => (
            <StaggerItem key={c.label}>
              <SummaryCard {...c} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ═══════════════════════════════════════════════════
          RINGKASAN KEUANGAN HARIAN
         ═══════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400 mb-3 px-1">
          Ringkasan Keuangan Harian
        </h2>
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {keuanganCards.map((c) => (
            <StaggerItem key={c.label}>
              <SummaryCard {...c} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </section>

      {/* ═══════════════════════════════════════════════════
          ANALISIS KEUANGAN BULANAN
         ═══════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400 mb-3 px-1">
          Analisis Keuangan Bulanan
        </h2>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* ─── Bar Chart: Pemasukan vs Pengeluaran ─── */}
          <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm p-5 sm:p-7">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Pemasukan vs Pengeluaran</h3>
                <p className="text-xs text-gray-400">{formatBulanIndonesia(currentMonth)}</p>
              </div>
            </div>
            {keuanganLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Memuat grafik...
                </div>
              </div>
            ) : keuanganChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={keuanganChart} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatRupiahShort(v)} />
                  <Tooltip content={<KeuanganTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="Pemasukan" fill="#10b981" radius={[5, 5, 0, 0]} barSize={16} />
                  <Bar dataKey="Pengeluaran" fill="#ef4444" radius={[5, 5, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-gray-400">
                Belum ada data keuangan bulan ini
              </div>
            )}
          </div>

          {/* ─── Area Chart: Saldo Harian ─── */}
          <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm p-5 sm:p-7">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <LineChartIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Saldo Harian</h3>
                <p className="text-xs text-gray-400">{formatBulanIndonesia(currentMonth)}</p>
              </div>
            </div>
            {keuanganLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Memuat grafik...
                </div>
              </div>
            ) : keuanganChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={keuanganChart} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatRupiahShort(v)} />
                  <Tooltip content={<KeuanganTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area
                    type="monotone"
                    dataKey="Saldo"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#saldoGradient)"
                    dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                    name="Saldo Bersih"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-gray-400">
                Belum ada data keuangan bulan ini
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
  );
}

// ── Reusable card ───────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, iconBg, iconColor }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/70 shadow-sm hover:shadow-md transition-shadow duration-200 p-4 sm:p-5 flex items-start gap-4">
      <div className={`shrink-0 w-11 h-11 ${iconBg} rounded-lg flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
        <p className="text-lg sm:text-xl font-bold text-gray-800 leading-tight mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}
