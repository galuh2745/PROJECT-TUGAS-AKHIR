'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, ShoppingCart, RefreshCw, Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

interface Penjualan {
  id: string;
  nomor_nota: string;
  customer_id: string;
  customer_nama: string;
  tanggal: string;
  jenis_transaksi: string;
  total_penjualan: number;
  grand_total: number;
  jumlah_bayar: number;
  sisa_piutang: number;
  status: string;
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

export default function PenjualanPage() {
  const router = useRouter();
  const [penjualan, setPenjualan] = useState<Penjualan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [tanggalDari, setTanggalDari] = useState('');
  const [tanggalSampai, setTanggalSampai] = useState('');

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

  useEffect(() => { fetchPenjualan(); }, [fetchPenjualan]);

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
            <h1 className="text-2xl font-bold tracking-tight">Riwayat Transaksi</h1>
            <p className="text-sm text-muted-foreground">Transaksi penjualan yang sudah difinalisasi</p>
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
                      <SelectItem value="sebagian">Sebagian</SelectItem>
                      <SelectItem value="lunas">Lunas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <Button onClick={fetchPenjualan} variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
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
                      <TableHead>No. Nota</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Bayar</TableHead>
                      <TableHead className="text-right">Piutang</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {penjualan.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/dashboard/admin/penjualan/${p.id}`)}>
                        <TableCell className="whitespace-nowrap">{formatTanggal(p.tanggal)}</TableCell>
                        <TableCell className="text-xs font-mono">{p.nomor_nota}</TableCell>
                        <TableCell className="font-medium">{p.customer_nama}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {p.jenis_transaksi === 'CAMPURAN' ? 'Campuran' :
                             p.jenis_transaksi === 'AYAM_HIDUP' ? 'Ayam Hidup' :
                             p.jenis_transaksi === 'DAGING' ? 'Daging' : p.jenis_transaksi}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatRupiah(p.grand_total)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatRupiah(p.jumlah_bayar)}</TableCell>
                        <TableCell className="text-right text-red-600">
                          {p.sisa_piutang > 0 ? formatRupiah(p.sisa_piutang) : '-'}
                        </TableCell>
                        <TableCell>
                          {p.sisa_piutang <= 0 ? (
                            <Badge className="bg-emerald-100 text-emerald-800">Lunas</Badge>
                          ) : p.jumlah_bayar > 0 ? (
                            <Badge className="bg-orange-100 text-orange-800">Sebagian</Badge>
                          ) : (
                            <Badge variant="destructive">Hutang</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`/penjualan/${p.id}/print`, '_blank')} title="Cetak Nota">
                              <Printer className="w-4 h-4" />
                            </Button>
                          </div>
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

    </StaggerContainer>
  );
}
