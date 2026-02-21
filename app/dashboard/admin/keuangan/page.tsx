'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  CalendarDays,
  CalendarRange,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

// ==================== Interfaces ====================

interface PemasukanDetail {
  penjualan_daging: number;
  penjualan_ayam_hidup: number;
  kas_masuk_penjualan?: number;
  kas_masuk_pelunasan?: number;
  total: number;
}

interface PengeluaranDetail {
  beli_ayam: number;
  operasional_daging: number;
  operasional_ayam_hidup: number;
  kerugian_ayam_mati: number;
  total: number;
}

interface PiutangDetail {
  piutang_baru: number;
  pelunasan: number;
  total_piutang_aktif: number;
}

interface KeuanganHarian {
  tanggal: string;
  pemasukan: PemasukanDetail;
  pengeluaran: PengeluaranDetail;
  saldo_harian: number;
  piutang?: PiutangDetail;
}

interface RekapHarianItem {
  tanggal: string;
  pemasukan: number;
  pengeluaran: number;
  saldo: number;
}

interface KeuanganBulanan {
  bulan: string;
  pemasukan: PemasukanDetail;
  pengeluaran: PengeluaranDetail;
  saldo_bulanan: number;
  piutang?: PiutangDetail;
  rekap_harian: RekapHarianItem[];
}

interface RekapBulananItem {
  bulan: string;
  pemasukan: number;
  pengeluaran: number;
  saldo: number;
}

interface KeuanganTahunan {
  tahun: string;
  pemasukan: PemasukanDetail;
  pengeluaran: PengeluaranDetail;
  saldo_tahunan: number;
  rekap_bulanan: RekapBulananItem[];
}

// ==================== Helpers ====================

const formatRupiah = (num: number): string => {
  const prefix = num < 0 ? '-Rp ' : 'Rp ';
  return prefix + Math.abs(num).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const getLocalDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getLocalMonthString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getLocalYearString = () => {
  return String(new Date().getFullYear());
};

const NAMA_BULAN: Record<string, string> = {
  '01': 'Januari',
  '02': 'Februari',
  '03': 'Maret',
  '04': 'April',
  '05': 'Mei',
  '06': 'Juni',
  '07': 'Juli',
  '08': 'Agustus',
  '09': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Desember',
};

const formatTanggal = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${NAMA_BULAN[m]} ${y}`;
};

const formatBulan = (monthStr: string): string => {
  const [y, m] = monthStr.split('-');
  return `${NAMA_BULAN[m]} ${y}`;
};

// ==================== Summary Cards ====================

function SummaryCards({
  pemasukan,
  pengeluaran,
  saldo,
  label,
  piutang,
}: {
  pemasukan: PemasukanDetail;
  pengeluaran: PengeluaranDetail;
  saldo: number;
  label: string;
  piutang?: PiutangDetail;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Kas Masuk</p>
                <p className="text-2xl font-bold text-emerald-600">{formatRupiah(pemasukan.total)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Penjualan Daging</span>
                <span className="font-medium">{formatRupiah(pemasukan.penjualan_daging)}</span>
              </div>
              <div className="flex justify-between">
                <span>Penjualan Ayam Hidup</span>
                <span className="font-medium">{formatRupiah(pemasukan.penjualan_ayam_hidup)}</span>
              </div>
              {(pemasukan.kas_masuk_penjualan !== undefined && pemasukan.kas_masuk_penjualan > 0) && (
                <div className="flex justify-between">
                  <span>Kas Masuk Penjualan</span>
                  <span className="font-medium">{formatRupiah(pemasukan.kas_masuk_penjualan)}</span>
                </div>
              )}
              {(pemasukan.kas_masuk_pelunasan !== undefined && pemasukan.kas_masuk_pelunasan > 0) && (
                <div className="flex justify-between">
                  <span>Pelunasan Piutang</span>
                  <span className="font-medium">{formatRupiah(pemasukan.kas_masuk_pelunasan)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pengeluaran</p>
                <p className="text-2xl font-bold text-red-600">{formatRupiah(pengeluaran.total)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <ArrowDownRight className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Beli Ayam</span>
                <span className="font-medium">{formatRupiah(pengeluaran.beli_ayam)}</span>
              </div>
              <div className="flex justify-between">
                <span>Operasional Daging</span>
                <span className="font-medium">{formatRupiah(pengeluaran.operasional_daging)}</span>
              </div>
              <div className="flex justify-between">
                <span>Operasional Ayam Hidup</span>
                <span className="font-medium">{formatRupiah(pengeluaran.operasional_ayam_hidup)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kerugian Ayam Mati</span>
                <span className="font-medium">{formatRupiah(pengeluaran.kerugian_ayam_mati)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${saldo >= 0 ? 'border-l-blue-500' : 'border-l-orange-500'}`}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo {label}</p>
              <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                {formatRupiah(saldo)}
              </p>
            </div>
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center ${saldo >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}
            >
              {saldo > 0 ? (
                <TrendingUp className={`h-5 w-5 ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
              ) : saldo < 0 ? (
                <TrendingDown className="h-5 w-5 text-orange-600" />
              ) : (
                <Minus className="h-5 w-5 text-gray-500" />
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Pemasukan - Pengeluaran</p>
        </CardContent>
      </Card>
    </div>

    {/* Piutang Card */}
    {piutang && (
      <Card className="border-l-4 border-l-amber-500">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Piutang Aktif</p>
              <p className="text-2xl font-bold text-amber-600">{formatRupiah(piutang.total_piutang_aktif)}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Piutang Baru</span>
              <span className="font-medium text-red-500">{formatRupiah(piutang.piutang_baru)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pelunasan</span>
              <span className="font-medium text-emerald-500">{formatRupiah(piutang.pelunasan)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )}
    </div>
  );
}

// ==================== Tab: Harian ====================

function TabHarian() {
  const [date, setDate] = useState(getLocalDateString());
  const [data, setData] = useState<KeuanganHarian | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/keuangan/harian?date=${date}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error || 'Gagal mengambil data');
      }
    } catch {
      toast.error('Gagal mengambil data keuangan harian');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="w-full sm:w-auto">
          <Label className="text-sm mb-1.5 block">Tanggal</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-48" />
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => window.open(`/api/keuangan/harian/pdf?date=${date}`, '_blank')}>
          <FileDown className="h-4 w-4 mr-1" /> Export PDF
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : data ? (
        <SummaryCards pemasukan={data.pemasukan} pengeluaran={data.pengeluaran} saldo={data.saldo_harian} label="Harian" piutang={data.piutang} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Tidak ada data</CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== Tab: Bulanan ====================

function TabBulanan() {
  const [month, setMonth] = useState(getLocalMonthString());
  const [data, setData] = useState<KeuanganBulanan | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/keuangan/bulanan?month=${month}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error || 'Gagal mengambil data');
      }
    } catch {
      toast.error('Gagal mengambil data keuangan bulanan');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="w-full sm:w-auto">
          <Label className="text-sm mb-1.5 block">Bulan</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full sm:w-48" />
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => window.open(`/api/keuangan/bulanan/pdf?month=${month}`, '_blank')}>
          <FileDown className="h-4 w-4 mr-1" /> Export PDF
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : data ? (
        <div className="space-y-4">
          <SummaryCards
            pemasukan={data.pemasukan}
            pengeluaran={data.pengeluaran}
            saldo={data.saldo_bulanan}
            label="Bulanan"
            piutang={data.piutang}
          />

          {/* Rekap Harian */}
          {data.rekap_harian.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Rekap Harian - {formatBulan(data.bulan)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead className="text-right">Pemasukan</TableHead>
                        <TableHead className="text-right">Pengeluaran</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rekap_harian.map((item) => (
                        <TableRow key={item.tanggal}>
                          <TableCell>{formatTanggal(item.tanggal)}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">
                            {formatRupiah(item.pemasukan)}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatRupiah(item.pengeluaran)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-bold ${item.saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}
                          >
                            {formatRupiah(item.saldo)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {formatRupiah(data.pemasukan.total)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatRupiah(data.pengeluaran.total)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${data.saldo_bulanan >= 0 ? 'text-blue-600' : 'text-orange-600'}`}
                        >
                          {formatRupiah(data.saldo_bulanan)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Tidak ada data</CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== Tab: Tahunan ====================

function TabTahunan() {
  const [year, setYear] = useState(getLocalYearString());
  const [data, setData] = useState<KeuanganTahunan | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/keuangan/tahunan?year=${year}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error || 'Gagal mengambil data');
      }
    } catch {
      toast.error('Gagal mengambil data keuangan tahunan');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="w-full sm:w-auto">
          <Label className="text-sm mb-1.5 block">Tahun</Label>
          <Input
            type="number"
            min="2020"
            max="2099"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full sm:w-32"
          />
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => window.open(`/api/keuangan/tahunan/pdf?year=${year}`, '_blank')}>
          <FileDown className="h-4 w-4 mr-1" /> Export PDF
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : data ? (
        <div className="space-y-4">
          <SummaryCards
            pemasukan={data.pemasukan}
            pengeluaran={data.pengeluaran}
            saldo={data.saldo_tahunan}
            label="Tahunan"
          />

          {/* Rekap Bulanan */}
          {data.rekap_bulanan.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Rekap Bulanan - {data.tahun}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bulan</TableHead>
                        <TableHead className="text-right">Pemasukan</TableHead>
                        <TableHead className="text-right">Pengeluaran</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rekap_bulanan.map((item) => (
                        <TableRow key={item.bulan}>
                          <TableCell>{formatBulan(item.bulan)}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">
                            {formatRupiah(item.pemasukan)}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatRupiah(item.pengeluaran)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-bold ${item.saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}
                          >
                            {formatRupiah(item.saldo)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {formatRupiah(data.pemasukan.total)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatRupiah(data.pengeluaran.total)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${data.saldo_tahunan >= 0 ? 'text-blue-600' : 'text-orange-600'}`}
                        >
                          {formatRupiah(data.saldo_tahunan)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Tidak ada data</CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== Main Page ====================

export default function KeuanganPage() {
  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Keuangan</h1>
            <p className="text-sm text-muted-foreground">Rekap keuangan otomatis dari data inventory</p>
          </div>
        </div>
      </StaggerItem>

      <StaggerItem>
        <Tabs defaultValue="harian">
          <TabsList className="mb-4">
            <TabsTrigger value="harian" className="gap-1.5">
              <Calendar className="h-4 w-4" />
              Harian
            </TabsTrigger>
            <TabsTrigger value="bulanan" className="gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Bulanan
            </TabsTrigger>
            <TabsTrigger value="tahunan" className="gap-1.5">
              <CalendarRange className="h-4 w-4" />
              Tahunan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="harian">
            <TabHarian />
          </TabsContent>
          <TabsContent value="bulanan">
            <TabBulanan />
          </TabsContent>
          <TabsContent value="tahunan">
            <TabTahunan />
          </TabsContent>
        </Tabs>
      </StaggerItem>
    </StaggerContainer>
  );
}
