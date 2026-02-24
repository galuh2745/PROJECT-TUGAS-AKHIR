'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Printer,
  Edit3,
  Clock,
  FileText,
  User,
  Calendar,
  CreditCard,
  AlertTriangle,
  History,
  RefreshCw,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PenjualanDetail {
  id: string;
  jenis_daging: string | null;
  ekor: number | null;
  berat: number;
  harga: number;
  subtotal: number;
}

interface PembayaranLogItem {
  id: string;
  total_lama: number;
  bayar_lama: number;
  sisa_lama: number;
  bayar_baru: number;
  sisa_baru: number;
  alasan: string;
  diubah_oleh: string;
  created_at: string;
}

interface PembayaranItem {
  id: string;
  jumlah_bayar: number;
  metode: string;
  tanggal: string;
  keterangan: string | null;
  created_at: string;
}

interface PenjualanData {
  id: string;
  nomor_nota: string;
  customer: {
    id: string;
    nama: string;
    no_hp: string | null;
    alamat: string | null;
  };
  tanggal: string;
  jenis_transaksi: string;
  total_penjualan: number;
  pengeluaran: number;
  grand_total: number;
  jumlah_bayar: number;
  sisa_piutang: number;
  status: string;
  metode_pembayaran: string;
  keterangan: string | null;
  created_at: string;
  updated_at: string;
  detail: PenjualanDetail[];
  pembayaran_log: PembayaranLogItem[];
  pembayaran: PembayaranItem[];
}

const formatRupiah = (num: number): string => {
  const prefix = num < 0 ? '-Rp ' : 'Rp ';
  return (
    prefix +
    Math.abs(num).toLocaleString('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
};

const formatTanggal = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatWaktu = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function DetailPenjualanPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<PenjualanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWarningPiutang, setShowWarningPiutang] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tambahBayar, setTambahBayar] = useState('');
  const [metodeBayar, setMetodeBayar] = useState('CASH');
  const [alasan, setAlasan] = useState('');

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/penjualan/${id}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error || 'Gagal memuat data');
      }
    } catch {
      toast.error('Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const openEditModal = () => {
    if (data) {
      // Show warning dialog if there's outstanding piutang
      if (data.sisa_piutang > 0) {
        setShowWarningPiutang(true);
        return;
      }
      setTambahBayar('');
      setMetodeBayar('CASH');
      setAlasan('');
      setShowEditModal(true);
    }
  };

  const proceedEditFromWarning = () => {
    setShowWarningPiutang(false);
    setTambahBayar('');
    setMetodeBayar('CASH');
    setAlasan('');
    setShowEditModal(true);
  };

  const handleEditPembayaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alasan.trim()) {
      toast.error('Alasan perubahan wajib diisi');
      return;
    }
    const tambahVal = parseFloat(tambahBayar || '0');
    if (tambahVal <= 0) {
      toast.error('Jumlah tambahan pembayaran harus lebih dari 0');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/penjualan/${id}/edit-pembayaran`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tambah_bayar: tambahVal,
          metode: metodeBayar,
          alasan: alasan.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Pembayaran berhasil ditambahkan');
        setShowEditModal(false);
        fetchDetail();
      } else {
        toast.error(json.error || 'Gagal menambah pembayaran');
      }
    } catch {
      toast.error('Terjadi kesalahan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCetakNota = () => {
    window.open(`/penjualan/${id}/print`, '_blank');
  };

  const tambahVal = parseFloat(tambahBayar || '0');
  const sisaPreview =
    data ? Math.max(0, data.sisa_piutang - tambahVal) : 0;
  const isRevisi = data && data.pembayaran && data.pembayaran.length > 1;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Data tidak ditemukan</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Detail Transaksi
              </h1>
              {isRevisi && (
                <Badge variant="destructive" className="text-xs">
                  REVISI
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {data.nomor_nota}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleCetakNota}>
            <Printer className="w-4 h-4 mr-2" />
            {isRevisi ? 'Cetak Ulang' : 'Cetak Nota'}
          </Button>
          <Button onClick={openEditModal} disabled={data.status === 'lunas'}>
            <Edit3 className="w-4 h-4 mr-2" /> {data.sisa_piutang > 0 ? 'Tambah Pembayaran' : 'Edit Pembayaran'}
          </Button>
        </div>
      </div>

      {/* Info Transaksi */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Informasi Transaksi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">No. Nota</span>
              <span className="text-sm font-medium">{data.nomor_nota}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Tanggal
              </span>
              <span className="text-sm font-medium">
                {formatTanggal(data.tanggal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> Metode
              </span>
              <Badge variant="outline">{data.metode_pembayaran}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              {data.status === 'lunas' ? (
                <Badge className="bg-emerald-100 text-emerald-800">
                  Lunas
                </Badge>
              ) : data.status === 'sebagian' ? (
                <Badge className="bg-amber-100 text-amber-800">
                  Sebagian
                </Badge>
              ) : (
                <Badge variant="destructive">Hutang</Badge>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Dibuat
              </span>
              <span className="text-sm">
                {formatWaktu(data.created_at)}
              </span>
            </div>
            {data.keterangan && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  Keterangan:
                </span>
                <p className="text-sm mt-1">{data.keterangan}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" /> Informasi Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Nama</span>
              <span className="text-sm font-medium">
                {data.customer.nama}
              </span>
            </div>
            {data.customer.no_hp && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">No. HP</span>
                <span className="text-sm">{data.customer.no_hp}</span>
              </div>
            )}
            {data.customer.alamat && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground">Alamat:</span>
                <p className="text-sm mt-1">{data.customer.alamat}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Item */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detail Item</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Ekor</TableHead>
                  <TableHead className="text-right">Berat (kg)</TableHead>
                  <TableHead className="text-right">Harga/kg</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.detail.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.jenis_daging || 'Ayam Hidup'}
                    </TableCell>
                    <TableCell className="text-center">
                      {d.ekor ? `${d.ekor} ek` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.berat.toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRupiah(d.harga)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatRupiah(d.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Ringkasan */}
          <div className="mt-4 border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total Penjualan</span>
              <span>{formatRupiah(data.total_penjualan)}</span>
            </div>
            {data.pengeluaran > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Pengeluaran</span>
                <span>-{formatRupiah(data.pengeluaran)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Grand Total</span>
              <span>{formatRupiah(data.grand_total)}</span>
            </div>
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Dibayar</span>
              <span>{formatRupiah(data.jumlah_bayar)}</span>
            </div>
            <div
              className={`flex justify-between font-bold text-base ${
                data.sisa_piutang > 0 ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              <span>Sisa</span>
              <span>
                {data.sisa_piutang > 0
                  ? formatRupiah(data.sisa_piutang)
                  : 'LUNAS'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Riwayat Pembayaran (dari tabel PembayaranPiutang) */}
      {data.pembayaran && data.pembayaran.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Riwayat Pembayaran
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pembayaran.map((p, idx) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{data.pembayaran.length - idx}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatTanggal(p.tanggal)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-emerald-600">
                        {formatRupiah(p.jumlah_bayar)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{p.metode}</Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {p.keterangan || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Riwayat Perubahan Pembayaran (Audit Trail) */}
      {data.pembayaran_log.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" /> Riwayat Perubahan Pembayaran
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Diubah Oleh</TableHead>
                    <TableHead className="text-right">Bayar Lama</TableHead>
                    <TableHead className="text-right">Bayar Baru</TableHead>
                    <TableHead className="text-right">Sisa Lama</TableHead>
                    <TableHead className="text-right">Sisa Baru</TableHead>
                    <TableHead>Alasan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pembayaran_log.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatWaktu(log.created_at)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {log.diubah_oleh}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatRupiah(log.bayar_lama)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-emerald-600 font-medium">
                        {formatRupiah(log.bayar_baru)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatRupiah(log.sisa_lama)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-red-600 font-medium">
                        {formatRupiah(log.sisa_baru)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {log.alasan}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== Dialog Warning Piutang ========== */}
      <Dialog open={showWarningPiutang} onOpenChange={setShowWarningPiutang}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" /> Pelunasan Sebaiknya dari Menu Piutang
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p>Transaksi ini masih memiliki sisa piutang sebesar <strong>{formatRupiah(data.sisa_piutang)}</strong>.</p>
              <p className="mt-2">Disarankan melakukan pelunasan melalui:</p>
              <p className="mt-1 font-semibold">💰 Keuangan → Piutang</p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowWarningPiutang(false);
                  router.push('/dashboard/admin/piutang');
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" /> Buka Piutang
              </Button>
              <Button
                onClick={proceedEditFromWarning}
              >
                Lanjutkan Dari Sini
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== Modal Tambah Pembayaran ========== */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5" /> Tambah Pembayaran
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditPembayaran} className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-md space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">No. Nota</span>
                <span className="font-medium">{data.nomor_nota}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{data.customer.nama}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-1">
                <span className="text-muted-foreground">Grand Total</span>
                <span className="font-medium">{formatRupiah(data.grand_total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sudah Dibayar</span>
                <span className="font-medium text-emerald-600">{formatRupiah(data.jumlah_bayar)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span className="text-red-600">Sisa Piutang</span>
                <span className="text-red-600">{formatRupiah(data.sisa_piutang)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tambahan Pembayaran *</Label>
              <Input
                type="number"
                min="1"
                step="1"
                max={data.sisa_piutang}
                value={tambahBayar}
                onChange={(e) => setTambahBayar(e.target.value)}
                placeholder={`Maks ${formatRupiah(data.sisa_piutang)}`}
                required
              />
              <p className="text-xs text-muted-foreground">
                Masukkan jumlah tambahan, bukan total keseluruhan.
              </p>
            </div>

            {/* Metode Pembayaran */}
            <div className="space-y-2">
              <Label>Metode Pembayaran *</Label>
              <Select value={metodeBayar} onValueChange={setMetodeBayar}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preview Sisa */}
            {tambahBayar && (
              <div
                className={`p-3 rounded-md border text-sm ${
                  sisaPreview > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div className="flex justify-between">
                  <span>Sisa Piutang Setelah Bayar:</span>
                  <span
                    className={`font-bold ${
                      sisaPreview > 0
                        ? 'text-red-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {sisaPreview > 0 ? formatRupiah(sisaPreview) : 'LUNAS'}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                Alasan / Keterangan *
              </Label>
              <Textarea
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={3}
                placeholder="Jelaskan alasan pembayaran tambahan..."
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  'Tambah Pembayaran'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
