'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { CreditCard, RefreshCw, Plus, AlertTriangle, CheckCircle2, Users, DollarSign, FileDown, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

interface CustomerPiutang {
  customer_id: string;
  customer_nama: string;
  no_hp: string | null;
  total_piutang: number;
  total_penjualan: number;
  total_dibayar: number;
  jumlah_transaksi: number;
  transaksi_tertua: string | null;
}

interface PiutangSummary {
  total_piutang_aktif: number;
  piutang_hari_ini: number;
  pelunasan_hari_ini: number;
  jumlah_customer_hutang: number;
  detail_per_customer: CustomerPiutang[];
}

interface Pembayaran {
  id: string;
  customer_id: string;
  customer_nama: string;
  tanggal: string;
  jumlah_bayar: number;
  metode: string;
  keterangan: string | null;
  created_at: string;
}

interface Customer {
  id: string;
  nama: string;
  total_piutang: number;
}

const formatRupiah = (num: number): string => {
  const prefix = num < 0 ? '-Rp ' : 'Rp ';
  return prefix + Math.abs(num).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatTanggal = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getLocalDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function PiutangPage() {
  const [summary, setSummary] = useState<PiutangSummary | null>(null);
  const [pembayaran, setPembayaran] = useState<Pembayaran[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPembayaran, setLoadingPembayaran] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCustomerPiutang, setSelectedCustomerPiutang] = useState<number>(0);
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [formData, setFormData] = useState({
    customer_id: '',
    tanggal: getLocalDateString(),
    jumlah_bayar: '',
    metode: 'CASH',
    keterangan: '',
  });

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const today = getLocalDateString();
      const res = await fetch(`/api/piutang?date=${today}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) setSummary(json.data);
      else toast.error(json.error || 'Gagal memuat data');
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  }, []);

  const fetchPembayaran = useCallback(async () => {
    try {
      setLoadingPembayaran(true);
      const res = await fetch('/api/pembayaran-piutang', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setPembayaran(json.data);
    } catch { /* ignore */ } finally { setLoadingPembayaran(false); }
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customer', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setCustomers(json.data.filter((c: Customer) => c.total_piutang > 0));
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchSummary(); fetchPembayaran(); fetchCustomers(); }, [fetchSummary, fetchPembayaran]);

  useEffect(() => {
    if (formData.customer_id) {
      const c = customers.find((x) => x.id === formData.customer_id);
      setSelectedCustomerPiutang(c?.total_piutang || 0);
    } else {
      setSelectedCustomerPiutang(0);
    }
  }, [formData.customer_id, customers]);

  // Filtered customer list for dropdown
  const filteredCustomers = useMemo(() => {
    if (!summary) return [];
    if (!filterCustomerId) return summary.detail_per_customer;
    return summary.detail_per_customer.filter(c => c.customer_id === filterCustomerId);
  }, [summary, filterCustomerId]);

  // Rekap hutang summary
  const rekapHutang = useMemo(() => {
    if (!summary || summary.detail_per_customer.length === 0) return null;
    const sorted = [...summary.detail_per_customer].sort((a, b) => b.total_piutang - a.total_piutang);
    const top5 = sorted.slice(0, 5);
    const avgPiutang = summary.total_piutang_aktif / summary.jumlah_customer_hutang;
    return { top5, avgPiutang };
  }, [summary]);

  // Rekap cards data (responsive to search filter)
  const rekapCardsData = useMemo(() => {
    if (!summary) return null;
    const source = filteredCustomers.length > 0 ? filteredCustomers : summary.detail_per_customer;
    const rekap = source.reduce((acc, c) => ({
      totalTransaksi: acc.totalTransaksi + c.jumlah_transaksi,
      totalPenjualan: acc.totalPenjualan + (c.total_penjualan || 0),
      totalDibayar: acc.totalDibayar + (c.total_dibayar || 0),
      totalPiutang: acc.totalPiutang + c.total_piutang,
    }), { totalTransaksi: 0, totalPenjualan: 0, totalDibayar: 0, totalPiutang: 0 });
    const totalPembayaran = pembayaran
      .filter(p => !filterCustomerId || filteredCustomers.some(c => c.customer_id === p.customer_id))
      .reduce((sum, p) => sum + p.jumlah_bayar, 0);
    return [
      { label: 'Jumlah Transaksi', value: rekap.totalTransaksi.toString(), border: 'border-l-indigo-500', color: 'text-indigo-600' },
      { label: 'Total Penjualan', value: formatRupiah(rekap.totalPenjualan), border: 'border-l-blue-500', color: 'text-blue-600' },
      { label: 'Total Dibayar', value: formatRupiah(rekap.totalDibayar + totalPembayaran), border: 'border-l-emerald-500', color: 'text-emerald-600' },
      { label: 'Sisa Piutang', value: formatRupiah(rekap.totalPiutang), border: 'border-l-red-500', color: 'text-red-600' },
      { label: 'Pembayaran Piutang', value: formatRupiah(totalPembayaran), border: 'border-l-orange-500', color: 'text-orange-600' },
    ];
  }, [summary, filteredCustomers, pembayaran, filterCustomerId]);

  const openBayarModal = (customerId?: string) => {
    setFormData({
      customer_id: customerId || '',
      tanggal: getLocalDateString(),
      jumlah_bayar: '',
      metode: 'CASH',
      keterangan: '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        customer_id: formData.customer_id,
        tanggal: formData.tanggal,
        jumlah_bayar: parseFloat(formData.jumlah_bayar),
        metode: formData.metode,
        keterangan: formData.keterangan || null,
      };

      const res = await fetch('/api/pembayaran-piutang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Pembayaran berhasil! Sisa piutang: ${formatRupiah(json.data.sisa_piutang_total)}`);
        setShowModal(false);
        fetchSummary();
        fetchPembayaran();
        fetchCustomers();
      } else {
        toast.error(json.error || 'Gagal menyimpan');
      }
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Piutang</h1>
            <p className="text-sm text-muted-foreground">Kelola piutang customer dan pembayaran</p>
          </div>
        </div>
      </StaggerItem>

      {/* Filter + Rekap Cards */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : summary ? (
        <>
          <Card className="mb-4">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:flex-1 space-y-1">
                  <Label>Filter Customer</Label>
                  <Select value={filterCustomerId} onValueChange={(v) => setFilterCustomerId(v === 'all' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Semua Customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Customer</SelectItem>
                      {summary.detail_per_customer.map((c) => (
                        <SelectItem key={c.customer_id} value={c.customer_id}>
                          {c.customer_nama} - {formatRupiah(c.total_piutang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
          {rekapCardsData && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              {rekapCardsData.map(c => (
                <Card key={c.label} className={`border-l-4 ${c.border}`}>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className={`text-xl font-bold ${c.color} mt-1`}>{c.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}

      <StaggerItem>
        <Tabs defaultValue="per-customer" id="piutang-tabs">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="per-customer" className="gap-1.5">
                <Users className="h-4 w-4" />
                Per Customer
              </TabsTrigger>
              <TabsTrigger value="rekap-hutang" className="gap-1.5">
                <TrendingDown className="h-4 w-4" />
                Rekap Hutang
              </TabsTrigger>
              <TabsTrigger value="riwayat-bayar" className="gap-1.5">
                <DollarSign className="h-4 w-4" />
                Riwayat Pembayaran
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                const url = filterCustomerId ? `/api/piutang/pdf?customer_id=${filterCustomerId}` : '/api/piutang/pdf';
                window.open(url, '_blank');
              }}>
                <FileDown className="w-4 h-4 mr-2" /> Export PDF
              </Button>
              <Button onClick={() => openBayarModal()} disabled={customers.length === 0}>
                <Plus className="w-4 h-4 mr-2" /> Bayar Piutang
              </Button>
            </div>
          </div>

          {/* Tab: Per Customer */}
          <TabsContent value="per-customer">
            <Card>
              <CardContent className="pt-6">
                {!summary || filteredCustomers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
                    <p>{filterCustomerId ? 'Tidak ditemukan customer dengan nama tersebut' : 'Tidak ada piutang aktif'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>No HP</TableHead>
                          <TableHead className="text-right">Total Piutang</TableHead>
                          <TableHead className="text-center">Transaksi</TableHead>
                          <TableHead>Piutang Tertua</TableHead>
                          <TableHead className="text-center">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCustomers.map((c) => (
                          <TableRow key={c.customer_id}>
                            <TableCell className="font-medium">{c.customer_nama}</TableCell>
                            <TableCell>{c.no_hp || '-'}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="destructive">{formatRupiah(c.total_piutang)}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{c.jumlah_transaksi}</TableCell>
                            <TableCell>
                              {c.transaksi_tertua ? formatTanggal(c.transaksi_tertua) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button size="sm" onClick={() => openBayarModal(c.customer_id)}>
                                Bayar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Rekap Hutang */}
          <TabsContent value="rekap-hutang">
            {!summary || summary.detail_per_customer.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
                    <p>Tidak ada piutang aktif</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Rekap Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-sm text-muted-foreground">Total Hutang Seluruh Customer</p>
                      <p className="text-2xl font-bold text-red-600">{formatRupiah(summary.total_piutang_aktif)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{summary.jumlah_customer_hutang} customer berhutang</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-sm text-muted-foreground">Rata-rata Hutang per Customer</p>
                      <p className="text-2xl font-bold text-amber-600">{rekapHutang ? formatRupiah(rekapHutang.avgPiutang) : '-'}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-sm text-muted-foreground">Total Transaksi Berhutang</p>
                      <p className="text-2xl font-bold text-blue-600">{summary.detail_per_customer.reduce((a, c) => a + c.jumlah_transaksi, 0)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Top 5 Customer Hutang Terbesar */}
                {rekapHutang && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        Top 5 Customer Hutang Terbesar
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {rekapHutang.top5.map((c, idx) => {
                          const pct = summary.total_piutang_aktif > 0 ? (c.total_piutang / summary.total_piutang_aktif) * 100 : 0;
                          return (
                            <div key={c.customer_id} className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-orange-500' : idx === 2 ? 'bg-amber-500' : 'bg-gray-400'}`}>{idx + 1}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium truncate">{c.customer_nama}</span>
                                  <span className="text-sm font-bold text-red-600 shrink-0 ml-2">{formatRupiah(c.total_piutang)}</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                  <div className={`h-2 rounded-full ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-orange-500' : idx === 2 ? 'bg-amber-500' : 'bg-gray-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <div className="flex justify-between mt-0.5">
                                  <span className="text-xs text-muted-foreground">{c.jumlah_transaksi} transaksi</span>
                                  <span className="text-xs text-muted-foreground">{pct.toFixed(1)}% dari total</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Tabel Lengkap Rekap Hutang */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rekap Hutang Seluruh Customer</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>No</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>No HP</TableHead>
                            <TableHead className="text-right">Total Hutang</TableHead>
                            <TableHead className="text-center">Jumlah Transaksi</TableHead>
                            <TableHead>Hutang Tertua</TableHead>
                            <TableHead className="text-right">% dari Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...summary.detail_per_customer].sort((a, b) => b.total_piutang - a.total_piutang).map((c, idx) => {
                            const pct = summary.total_piutang_aktif > 0 ? (c.total_piutang / summary.total_piutang_aktif) * 100 : 0;
                            return (
                              <TableRow key={c.customer_id}>
                                <TableCell>{idx + 1}</TableCell>
                                <TableCell className="font-medium">{c.customer_nama}</TableCell>
                                <TableCell>{c.no_hp || '-'}</TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="destructive">{formatRupiah(c.total_piutang)}</Badge>
                                </TableCell>
                                <TableCell className="text-center">{c.jumlah_transaksi}</TableCell>
                                <TableCell>{c.transaksi_tertua ? formatTanggal(c.transaksi_tertua) : '-'}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{pct.toFixed(1)}%</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Tab: Riwayat Pembayaran */}
          <TabsContent value="riwayat-bayar">
            <Card>
              <CardContent className="pt-6">
                {loadingPembayaran ? (
                  <div className="flex justify-center py-12"><LoadingSpinner /></div>
                ) : pembayaran.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Belum ada riwayat pembayaran</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Jumlah Bayar</TableHead>
                          <TableHead>Metode</TableHead>
                          <TableHead>Keterangan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pembayaran.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{formatTanggal(p.tanggal)}</TableCell>
                            <TableCell className="font-medium">{p.customer_nama}</TableCell>
                            <TableCell className="text-right text-emerald-600 font-medium">
                              {formatRupiah(p.jumlah_bayar)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{p.metode}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{p.keterangan || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </StaggerItem>

      {/* Modal Bayar Piutang */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bayar Piutang</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select value={formData.customer_id} onValueChange={(v) => setFormData({ ...formData, customer_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nama} - Piutang: {formatRupiah(c.total_piutang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomerPiutang > 0 && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                  Total piutang: <strong>{formatRupiah(selectedCustomerPiutang)}</strong>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tanggal *</Label>
              <Input type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} required />
            </div>

            <div className="space-y-2">
              <Label>Jumlah Bayar *</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                max={selectedCustomerPiutang || undefined}
                value={formData.jumlah_bayar}
                onChange={(e) => setFormData({ ...formData, jumlah_bayar: e.target.value })}
                placeholder="0"
                required
              />
              {selectedCustomerPiutang > 0 && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0 h-auto text-xs"
                  onClick={() => setFormData({ ...formData, jumlah_bayar: selectedCustomerPiutang.toString() })}
                >
                  Bayar Lunas ({formatRupiah(selectedCustomerPiutang)})
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Metode Pembayaran *</Label>
              <Select value={formData.metode} onValueChange={(v) => setFormData({ ...formData, metode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Keterangan</Label>
              <Textarea
                value={formData.keterangan}
                onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                rows={2}
                placeholder="Opsional"
              />
            </div>

            {/* Preview */}
            {parseFloat(formData.jumlah_bayar || '0') > 0 && selectedCustomerPiutang > 0 && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm">
                <div className="flex justify-between">
                  <span>Sisa Setelah Bayar:</span>
                  <span className="font-bold text-emerald-600">
                    {formatRupiah(Math.max(0, selectedCustomerPiutang - parseFloat(formData.jumlah_bayar)))}
                  </span>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Memproses...' : 'Bayar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </StaggerContainer>
  );
}
