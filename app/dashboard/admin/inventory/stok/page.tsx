'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ArrowUp, ArrowDown, Package, Info, RotateCcw, Download, Loader2, Calendar, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem, FadeIn } from '@/components/ui/page-transition';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

interface StokPerPerusahaan {
  perusahaan_id: string;
  nama_perusahaan: string;
  total_masuk: number;
  total_mati: number;
  total_keluar: number;
  stok_ayam_hidup: number;
}

interface StokData {
  per_perusahaan: StokPerPerusahaan[];
  total: { total_masuk: number; total_mati: number; total_keluar: number; stok_ayam_hidup: number };
}

interface RekapBulanan {
  perusahaan_id: string;
  nama_perusahaan: string;
  total_masuk: number;
  total_mati: number;
  total_keluar: number;
  selisih: number;
  jumlah_transaksi_masuk: number;
  jumlah_transaksi_mati: number;
  jumlah_transaksi_keluar: number;
}

interface RekapBulananData {
  periode: { bulan: number; tahun: number; nama_bulan: string };
  per_perusahaan: RekapBulanan[];
  total: { total_masuk: number; total_mati: number; total_keluar: number; selisih: number };
}

interface Perusahaan { id: string; nama_perusahaan: string; }

interface RekapHarian {
  perusahaan_id: string;
  nama_perusahaan: string;
  sisa_kemarin: number;
  masuk_hari_ini: number;
  mati_hari_ini: number;
  keluar_hari_ini: number;
  total_stok: number;
}

interface RekapHarianData {
  tanggal: string;
  per_perusahaan: RekapHarian[];
  total: { sisa_kemarin: number; masuk_hari_ini: number; mati_hari_ini: number; keluar_hari_ini: number; total_stok: number };
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const getBulanNama = (b: number) => ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][b - 1] || '';

export default function StokAyamPage() {
  const [stokData, setStokData] = useState<StokData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Rekap Bulanan state
  const [rekapBulan, setRekapBulan] = useState(new Date().getMonth() + 1);
  const [rekapTahun, setRekapTahun] = useState(new Date().getFullYear());
  const [rekapPerusahaan, setRekapPerusahaan] = useState('');
  const [rekapData, setRekapData] = useState<RekapBulananData | null>(null);
  const [rekapLoading, setRekapLoading] = useState(false);
  const [perusahaanList, setPerusahaanList] = useState<Perusahaan[]>([]);
  const [exporting, setExporting] = useState(false);

  // Stok Saat Ini export
  const [stokExporting, setStokExporting] = useState(false);

  // Rekap Harian state
  const [harianTanggal, setHarianTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [harianPerusahaan, setHarianPerusahaan] = useState('');
  const [harianData, setHarianData] = useState<RekapHarianData | null>(null);
  const [harianLoading, setHarianLoading] = useState(false);
  const [harianExporting, setHarianExporting] = useState(false);

  const fetchStok = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/inventory/stok', { credentials: 'include' });
      const result = await response.json();
      if (result.success) {
        setStokData(result.data);
        // Extract perusahaan list from stok data
        if (result.data.per_perusahaan) {
          setPerusahaanList(result.data.per_perusahaan.map((p: StokPerPerusahaan) => ({
            id: p.perusahaan_id,
            nama_perusahaan: p.nama_perusahaan,
          })));
        }
      } else setError(result.error || 'Gagal memuat data stok');
    } catch { setError('Terjadi kesalahan saat memuat data'); } finally { setLoading(false); }
  };

  const fetchRekapBulanan = async () => {
    try {
      setRekapLoading(true);
      const params = new URLSearchParams({ bulan: rekapBulan.toString(), tahun: rekapTahun.toString() });
      if (rekapPerusahaan) params.append('perusahaan_id', rekapPerusahaan);
      const response = await fetch(`/api/inventory/stok/rekap-bulanan?${params.toString()}`, { credentials: 'include' });
      const result = await response.json();
      if (result.success) setRekapData(result.data);
      else toast.error(result.error || 'Gagal memuat rekap');
    } catch { toast.error('Terjadi kesalahan'); } finally { setRekapLoading(false); }
  };

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams({ bulan: rekapBulan.toString(), tahun: rekapTahun.toString() });
      if (rekapPerusahaan) params.append('perusahaan_id', rekapPerusahaan);
      const response = await fetch(`/api/inventory/stok/pdf?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Gagal mengexport PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rekap_Stok_Ayam_${getBulanNama(rekapBulan)}_${rekapTahun}.pdf`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      toast.success('PDF berhasil diunduh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengexport PDF');
    } finally { setExporting(false); }
  };

  const handleExportStokPDF = async () => {
    try {
      setStokExporting(true);
      const response = await fetch('/api/inventory/stok/pdf-saat-ini', { credentials: 'include' });
      if (!response.ok) throw new Error('Gagal mengexport PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().split('T')[0];
      a.download = `Stok_Ayam_Saat_Ini_${today}.pdf`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      toast.success('PDF berhasil diunduh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengexport PDF');
    } finally { setStokExporting(false); }
  };

  useEffect(() => { fetchStok(); }, []);
  useEffect(() => { fetchRekapBulanan(); }, [rekapBulan, rekapTahun, rekapPerusahaan]);

  const fetchRekapHarian = async () => {
    try {
      setHarianLoading(true);
      const params = new URLSearchParams({ tanggal: harianTanggal });
      if (harianPerusahaan) params.append('perusahaan_id', harianPerusahaan);
      const response = await fetch(`/api/inventory/stok/rekap-harian?${params.toString()}`, { credentials: 'include' });
      const result = await response.json();
      if (result.success) setHarianData(result.data);
      else toast.error(result.error || 'Gagal memuat rekap harian');
    } catch { toast.error('Terjadi kesalahan'); } finally { setHarianLoading(false); }
  };

  const handleExportHarianPDF = async () => {
    try {
      setHarianExporting(true);
      const params = new URLSearchParams({ tanggal: harianTanggal });
      if (harianPerusahaan) params.append('perusahaan_id', harianPerusahaan);
      const response = await fetch(`/api/inventory/stok/rekap-harian/pdf?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Gagal mengexport PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rekap_Stok_Harian_${harianTanggal}.pdf`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      toast.success('PDF berhasil diunduh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengexport PDF');
    } finally { setHarianExporting(false); }
  };

  useEffect(() => { fetchRekapHarian(); }, [harianTanggal, harianPerusahaan]);

  const fmt = (v: number) => new Intl.NumberFormat('id-ID').format(v);

  const tahunOptions = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) tahunOptions.push(y);

  if (loading) return <LoadingSpinner text="Memuat data stok..." />;

  const summaryCards = stokData ? [
    { label: 'Total Masuk', value: stokData.total.total_masuk, icon: ArrowUp, color: 'text-emerald-600', bg: 'bg-emerald-100', prefix: '+', unit: 'ekor' },
    { label: 'Total Mati', value: stokData.total.total_mati, icon: ArrowDown, color: 'text-red-600', bg: 'bg-red-100', prefix: '-', unit: 'ekor' },
    { label: 'Total Keluar', value: stokData.total.total_keluar, icon: ArrowDown, color: 'text-orange-600', bg: 'bg-orange-100', prefix: '-', unit: 'ekor' },
    { label: 'Stok Tersedia', value: stokData.total.stok_ayam_hidup, icon: Package, color: 'text-blue-600', bg: 'bg-blue-100', prefix: '', unit: 'ekor ayam hidup', highlight: true },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stok Ayam Hidup</h1>
          <p className="text-muted-foreground text-sm mt-1">Perhitungan stok ayam hidup per perusahaan (otomatis)</p>
        </div>
        <Button variant="outline" onClick={fetchStok}><RotateCcw className="w-4 h-4 mr-2" /> Refresh</Button>
      </div>

      {error && <Card className="border-red-200 bg-red-50"><CardContent className="pt-6 text-red-700">{error}</CardContent></Card>}

      <Tabs defaultValue="stok-saat-ini">
        <TabsList>
          <TabsTrigger value="stok-saat-ini">Stok Saat Ini</TabsTrigger>
          <TabsTrigger value="rekap-harian">Rekap Harian</TabsTrigger>
          <TabsTrigger value="rekap-bulanan">Rekap Bulanan</TabsTrigger>
        </TabsList>

        {/* ===== TAB: STOK SAAT INI ===== */}
        <TabsContent value="stok-saat-ini" className="space-y-6">
          {/* Info */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6 flex gap-3">
              <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-800">Rumus Perhitungan Stok</p>
                <p className="text-blue-700 mt-1"><strong>STOK</strong> = Total Barang Masuk - Total Ayam Mati - Total Barang Keluar</p>
                <p className="text-xs text-blue-600 mt-1">Stok dihitung secara otomatis dan tidak disimpan di database.</p>
              </div>
            </CardContent>
          </Card>

          {stokData && (
            <>
              <div className="flex justify-end">
                <Button onClick={handleExportStokPDF} disabled={stokExporting} variant="outline" className="gap-2">
                  {stokExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {stokExporting ? 'Mengunduh...' : 'Download PDF'}
                </Button>
              </div>

              <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {summaryCards.map(item => (
                  <StaggerItem key={item.label}>
                    <Card className={item.highlight ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' : ''}>
                      <CardContent className="flex items-center gap-3 pt-6">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.highlight ? 'bg-white/20' : item.bg}`}>
                          <item.icon className={`w-5 h-5 ${item.highlight ? 'text-white' : item.color}`} />
                        </div>
                        <div>
                          <p className={`text-sm ${item.highlight ? 'text-white/80' : 'text-muted-foreground'}`}>{item.label}</p>
                          <p className={`text-2xl font-bold ${item.highlight ? 'text-white' : item.color}`}>{item.prefix}{fmt(item.value)}</p>
                          <p className={`text-xs ${item.highlight ? 'text-white/60' : 'text-muted-foreground'}`}>{item.unit}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </StaggerItem>
                ))}
              </StaggerContainer>

              <Card>
                <CardHeader><CardTitle className="text-base">Stok per Perusahaan</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No</TableHead>
                        <TableHead>Perusahaan</TableHead>
                        <TableHead className="text-right text-emerald-600">Masuk</TableHead>
                        <TableHead className="text-right text-red-600">Mati</TableHead>
                        <TableHead className="text-right text-orange-600">Keluar</TableHead>
                        <TableHead className="text-right text-blue-600">Stok</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stokData.per_perusahaan.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Belum ada data perusahaan</TableCell></TableRow>
                      ) : stokData.per_perusahaan.map((item, idx) => (
                        <TableRow key={item.perusahaan_id}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{item.nama_perusahaan}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">+{fmt(item.total_masuk)}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">-{fmt(item.total_mati)}</TableCell>
                          <TableCell className="text-right text-orange-600 font-medium">-{fmt(item.total_keluar)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${item.stok_ayam_hidup > 0 ? 'bg-blue-100 text-blue-800' : item.stok_ayam_hidup < 0 ? 'bg-red-100 text-red-800' : 'bg-muted text-muted-foreground'}`}>
                              {fmt(item.stok_ayam_hidup)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={2}>TOTAL</TableCell>
                        <TableCell className="text-right text-emerald-600">+{fmt(stokData.total.total_masuk)}</TableCell>
                        <TableCell className="text-right text-red-600">-{fmt(stokData.total.total_mati)}</TableCell>
                        <TableCell className="text-right text-orange-600">-{fmt(stokData.total.total_keluar)}</TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex px-4 py-2 rounded-full text-base font-bold bg-blue-600 text-white">{fmt(stokData.total.stok_ayam_hidup)}</span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===== TAB: REKAP HARIAN ===== */}
        <TabsContent value="rekap-harian" className="space-y-6">
          {/* Info */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6 flex gap-3">
              <ClipboardList className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-800">Rekap Harian Stok Ayam</p>
                <p className="text-blue-700 mt-1">
                  <strong>Sisa Kemarin</strong> = akumulasi stok s/d hari sebelumnya &nbsp;|&nbsp;
                  <strong>Total Stok</strong> = Sisa Kemarin + Masuk - Mati - Keluar
                </p>
                <p className="text-xs text-blue-600 mt-1">Sisa stok kemarin otomatis digabung dengan stok hari ini.</p>
              </div>
            </CardContent>
          </Card>

          {/* Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label>Tanggal</Label>
                  <Input
                    type="date"
                    value={harianTanggal}
                    onChange={(e) => setHarianTanggal(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Perusahaan</Label>
                  <select value={harianPerusahaan} onChange={(e) => setHarianPerusahaan(e.target.value)} className={selectClass}>
                    <option value="">Semua Perusahaan</option>
                    {perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}
                  </select>
                </div>
                <Button onClick={handleExportHarianPDF} disabled={harianExporting || harianLoading || !harianData} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-lg">
                  {harianExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  {harianExporting ? 'Mengexport...' : 'Export PDF'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {harianLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Memuat rekap harian...</span>
            </div>
          ) : harianData ? (
            <>
              {/* Summary Cards */}
              <StaggerContainer className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Sisa Kemarin</p>
                        <p className="text-xl font-bold text-gray-700">{fmt(harianData.total.sisa_kemarin)}</p>
                        <p className="text-xs text-muted-foreground">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <ArrowUp className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Masuk Hari Ini</p>
                        <p className="text-xl font-bold text-emerald-600">+{fmt(harianData.total.masuk_hari_ini)}</p>
                        <p className="text-xs text-muted-foreground">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                        <ArrowDown className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Mati Hari Ini</p>
                        <p className="text-xl font-bold text-red-600">-{fmt(harianData.total.mati_hari_ini)}</p>
                        <p className="text-xs text-muted-foreground">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                        <ArrowDown className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Keluar Hari Ini</p>
                        <p className="text-xl font-bold text-orange-600">-{fmt(harianData.total.keluar_hari_ini)}</p>
                        <p className="text-xs text-muted-foreground">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Package className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-white/80">Total Stok</p>
                        <p className="text-xl font-bold text-white">{fmt(harianData.total.total_stok)}</p>
                        <p className="text-xs text-white/60">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              </StaggerContainer>

              {/* Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Rekap per Perusahaan — {new Date(harianData.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No</TableHead>
                        <TableHead>Perusahaan</TableHead>
                        <TableHead className="text-right text-gray-600">Sisa Kemarin</TableHead>
                        <TableHead className="text-right text-emerald-600">Masuk</TableHead>
                        <TableHead className="text-right text-red-600">Mati</TableHead>
                        <TableHead className="text-right text-orange-600">Keluar</TableHead>
                        <TableHead className="text-right text-blue-600">Total Stok</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {harianData.per_perusahaan.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Tidak ada data untuk tanggal ini</TableCell></TableRow>
                      ) : harianData.per_perusahaan.map((item, idx) => (
                        <TableRow key={item.perusahaan_id}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{item.nama_perusahaan}</TableCell>
                          <TableCell className="text-right text-gray-600 font-medium">{fmt(item.sisa_kemarin)}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">{item.masuk_hari_ini > 0 ? `+${fmt(item.masuk_hari_ini)}` : '0'}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">{item.mati_hari_ini > 0 ? `-${fmt(item.mati_hari_ini)}` : '0'}</TableCell>
                          <TableCell className="text-right text-orange-600 font-medium">{item.keluar_hari_ini > 0 ? `-${fmt(item.keluar_hari_ini)}` : '0'}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${item.total_stok > 0 ? 'bg-blue-100 text-blue-800' : item.total_stok < 0 ? 'bg-red-100 text-red-800' : 'bg-muted text-muted-foreground'}`}>
                              {fmt(item.total_stok)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                      {harianData.per_perusahaan.length > 0 && (
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={2}>TOTAL</TableCell>
                          <TableCell className="text-right text-gray-600">{fmt(harianData.total.sisa_kemarin)}</TableCell>
                          <TableCell className="text-right text-emerald-600">{harianData.total.masuk_hari_ini > 0 ? `+${fmt(harianData.total.masuk_hari_ini)}` : '0'}</TableCell>
                          <TableCell className="text-right text-red-600">{harianData.total.mati_hari_ini > 0 ? `-${fmt(harianData.total.mati_hari_ini)}` : '0'}</TableCell>
                          <TableCell className="text-right text-orange-600">{harianData.total.keluar_hari_ini > 0 ? `-${fmt(harianData.total.keluar_hari_ini)}` : '0'}</TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex px-4 py-2 rounded-full text-base font-bold bg-blue-600 text-white">
                              {fmt(harianData.total.total_stok)}
                            </span>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ===== TAB: REKAP BULANAN ===== */}
        <TabsContent value="rekap-bulanan" className="space-y-6">
          {/* Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label>Bulan</Label>
                  <select value={rekapBulan} onChange={(e) => setRekapBulan(parseInt(e.target.value))} className={selectClass}>
                    {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{getBulanNama(i+1)}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Tahun</Label>
                  <select value={rekapTahun} onChange={(e) => setRekapTahun(parseInt(e.target.value))} className={selectClass}>
                    {tahunOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Perusahaan</Label>
                  <select value={rekapPerusahaan} onChange={(e) => setRekapPerusahaan(e.target.value)} className={selectClass}>
                    <option value="">Semua Perusahaan</option>
                    {perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}
                  </select>
                </div>
                <Button onClick={handleExportPDF} disabled={exporting || rekapLoading || !rekapData} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-lg">
                  {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  {exporting ? 'Mengexport...' : 'Export PDF'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {rekapLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Memuat rekap...</span>
            </div>
          ) : rekapData ? (
            <>
              {/* Rekap Summary */}
              <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <ArrowUp className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Masuk Bulan Ini</p>
                        <p className="text-xl font-bold text-emerald-600">+{fmt(rekapData.total.total_masuk)}</p>
                        <p className="text-xs text-muted-foreground">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                        <ArrowDown className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Mati Bulan Ini</p>
                        <p className="text-xl font-bold text-red-600">-{fmt(rekapData.total.total_mati)}</p>
                        <p className="text-xs text-muted-foreground">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                        <ArrowDown className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Keluar Bulan Ini</p>
                        <p className="text-xl font-bold text-orange-600">-{fmt(rekapData.total.total_keluar)}</p>
                        <p className="text-xs text-muted-foreground">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
                <StaggerItem>
                  <Card className="rounded-xl shadow-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                    <CardContent className="flex items-center gap-3 pt-6 min-h-[80px]">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-white/80">Selisih Bulan Ini</p>
                        <p className="text-xl font-bold text-white">{fmt(rekapData.total.selisih)}</p>
                        <p className="text-xs text-white/60">ekor</p>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              </StaggerContainer>

              {/* Rekap Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Rekap per Perusahaan — {rekapData.periode.nama_bulan} {rekapData.periode.tahun}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No</TableHead>
                        <TableHead>Perusahaan</TableHead>
                        <TableHead className="text-right text-emerald-600">Masuk</TableHead>
                        <TableHead className="text-right text-red-600">Mati</TableHead>
                        <TableHead className="text-right text-orange-600">Keluar</TableHead>
                        <TableHead className="text-right text-blue-600">Selisih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rekapData.per_perusahaan.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada data untuk periode ini</TableCell></TableRow>
                      ) : rekapData.per_perusahaan.map((item, idx) => (
                        <TableRow key={item.perusahaan_id}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{item.nama_perusahaan}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">+{fmt(item.total_masuk)}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">-{fmt(item.total_mati)}</TableCell>
                          <TableCell className="text-right text-orange-600 font-medium">-{fmt(item.total_keluar)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${item.selisih > 0 ? 'bg-emerald-100 text-emerald-800' : item.selisih < 0 ? 'bg-red-100 text-red-800' : 'bg-muted text-muted-foreground'}`}>
                              {item.selisih > 0 ? '+' : ''}{fmt(item.selisih)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                      {rekapData.per_perusahaan.length > 0 && (
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={2}>TOTAL</TableCell>
                          <TableCell className="text-right text-emerald-600">+{fmt(rekapData.total.total_masuk)}</TableCell>
                          <TableCell className="text-right text-red-600">-{fmt(rekapData.total.total_mati)}</TableCell>
                          <TableCell className="text-right text-orange-600">-{fmt(rekapData.total.total_keluar)}</TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex px-4 py-2 rounded-full text-base font-bold bg-blue-600 text-white">
                              {rekapData.total.selisih > 0 ? '+' : ''}{fmt(rekapData.total.selisih)}
                            </span>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
