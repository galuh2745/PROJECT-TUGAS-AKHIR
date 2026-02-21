'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Search, ShoppingCart, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

interface Customer { id: string; nama: string; total_piutang: number; }
interface Penjualan {
  id: string;
  customer_id: string;
  customer_nama: string;
  tanggal: string;
  total_penjualan: number;
  jumlah_bayar: number;
  sisa_piutang: number;
  metode_pembayaran: string;
  keterangan: string | null;
  created_at: string;
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

export default function PenjualanPage() {
  const [penjualan, setPenjualan] = useState<Penjualan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [tanggalDari, setTanggalDari] = useState('');
  const [tanggalSampai, setTanggalSampai] = useState('');
  const [customerPiutangInfo, setCustomerPiutangInfo] = useState<number>(0);
  const [formData, setFormData] = useState({
    customer_id: '',
    tanggal: getLocalDateString(),
    total_penjualan: '',
    jumlah_bayar: '',
    metode_pembayaran: 'CASH',
    keterangan: '',
  });

  const fetchPenjualan = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (tanggalDari) params.set('tanggal_dari', tanggalDari);
      if (tanggalSampai) params.set('tanggal_sampai', tanggalSampai);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/penjualan?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) setPenjualan(json.data);
      else toast.error(json.error || 'Gagal memuat data');
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  }, [tanggalDari, tanggalSampai, filterStatus]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customer', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setCustomers(json.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchPenjualan(); }, [fetchPenjualan]);
  useEffect(() => { fetchCustomers(); }, []);

  // When customer changes in form, show piutang info
  useEffect(() => {
    if (formData.customer_id) {
      const c = customers.find((x) => x.id === formData.customer_id);
      setCustomerPiutangInfo(c?.total_piutang || 0);
    } else {
      setCustomerPiutangInfo(0);
    }
  }, [formData.customer_id, customers]);

  const openAddModal = () => {
    setFormData({
      customer_id: '',
      tanggal: getLocalDateString(),
      total_penjualan: '',
      jumlah_bayar: '',
      metode_pembayaran: 'CASH',
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
        total_penjualan: parseFloat(formData.total_penjualan),
        jumlah_bayar: parseFloat(formData.jumlah_bayar || '0'),
        metode_pembayaran: formData.metode_pembayaran,
        keterangan: formData.keterangan || null,
      };

      const res = await fetch('/api/penjualan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        const sisaPiutang = json.data.sisa_piutang;
        if (sisaPiutang > 0) {
          toast.success(`Penjualan berhasil! Piutang: ${formatRupiah(sisaPiutang)}`);
        } else {
          toast.success('Penjualan berhasil! (LUNAS)');
        }
        setShowModal(false);
        fetchPenjualan();
        fetchCustomers();
      } else {
        toast.error(json.error || 'Gagal menyimpan');
      }
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  const sisaPiutangCalc = parseFloat(formData.total_penjualan || '0') - parseFloat(formData.jumlah_bayar || '0');
  const totalPenjualanToday = penjualan.reduce((s, p) => s + p.total_penjualan, 0);
  const totalKasMasuk = penjualan.reduce((s, p) => s + p.jumlah_bayar, 0);
  const totalPiutangBaru = penjualan.reduce((s, p) => s + p.sisa_piutang, 0);

  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Penjualan</h1>
            <p className="text-sm text-muted-foreground">Transaksi penjualan dan pencatatan piutang</p>
          </div>
        </div>
      </StaggerItem>

      {/* Summary */}
      <StaggerItem>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Total Penjualan</p>
              <p className="text-2xl font-bold">{formatRupiah(totalPenjualanToday)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Kas Masuk</p>
              <p className="text-2xl font-bold text-emerald-600">{formatRupiah(totalKasMasuk)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Piutang Baru</p>
              <p className="text-2xl font-bold text-amber-600">{formatRupiah(totalPiutangBaru)}</p>
            </CardContent>
          </Card>
        </div>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardContent className="pt-6">
            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-3 mb-4">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Dari Tanggal</Label>
                  <Input type="date" value={tanggalDari} onChange={(e) => setTanggalDari(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Sampai Tanggal</Label>
                  <Input type="date" value={tanggalSampai} onChange={(e) => setTanggalSampai(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      <SelectItem value="hutang">Hutang</SelectItem>
                      <SelectItem value="lunas">Lunas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <Button onClick={fetchPenjualan} variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
                <Button onClick={openAddModal}>
                  <Plus className="w-4 h-4 mr-2" /> Tambah Penjualan
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : penjualan.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Belum ada data penjualan</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Bayar</TableHead>
                      <TableHead className="text-right">Piutang</TableHead>
                      <TableHead>Metode</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {penjualan.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatTanggal(p.tanggal)}</TableCell>
                        <TableCell className="font-medium">{p.customer_nama}</TableCell>
                        <TableCell className="text-right">{formatRupiah(p.total_penjualan)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatRupiah(p.jumlah_bayar)}</TableCell>
                        <TableCell className="text-right text-red-600">
                          {p.sisa_piutang > 0 ? formatRupiah(p.sisa_piutang) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.metode_pembayaran}</Badge>
                        </TableCell>
                        <TableCell>
                          {p.sisa_piutang > 0 ? (
                            <Badge variant="destructive">Hutang</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800">Lunas</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </StaggerItem>

      {/* Modal Add Penjualan */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Penjualan</DialogTitle>
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
                      {c.nama} {c.total_piutang > 0 ? `(Hutang: ${formatRupiah(c.total_piutang)})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customerPiutangInfo > 0 && (
                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Customer ini memiliki piutang aktif: <strong>{formatRupiah(customerPiutangInfo)}</strong></span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tanggal *</Label>
              <Input type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Penjualan *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.total_penjualan}
                  onChange={(e) => setFormData({ ...formData, total_penjualan: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Jumlah Bayar</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  max={formData.total_penjualan || undefined}
                  value={formData.jumlah_bayar}
                  onChange={(e) => setFormData({ ...formData, jumlah_bayar: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Sisa Piutang Preview */}
            {parseFloat(formData.total_penjualan || '0') > 0 && (
              <div className={`p-3 rounded-md border text-sm ${sisaPiutangCalc > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex justify-between">
                  <span>Sisa Piutang:</span>
                  <span className={`font-bold ${sisaPiutangCalc > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {sisaPiutangCalc > 0 ? formatRupiah(sisaPiutangCalc) : 'LUNAS'}
                  </span>
                </div>
                {customerPiutangInfo > 0 && sisaPiutangCalc > 0 && (
                  <div className="flex justify-between mt-1 text-amber-600">
                    <span>Total Piutang Aktif:</span>
                    <span className="font-bold">{formatRupiah(customerPiutangInfo + sisaPiutangCalc)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Metode Pembayaran *</Label>
              <Select value={formData.metode_pembayaran} onValueChange={(v) => setFormData({ ...formData, metode_pembayaran: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="CAMPUR">Campur</SelectItem>
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Menyimpan...' : 'Simpan Penjualan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </StaggerContainer>
  );
}
