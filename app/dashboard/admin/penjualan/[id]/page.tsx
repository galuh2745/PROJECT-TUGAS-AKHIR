'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Printer,
  Clock,
  FileText,
  User,
  Calendar,
  CreditCard,
  History,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

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

  const handleCetakNota = () => {
    window.open(`/penjualan/${id}/print`, '_blank');
  };

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
          {data.sisa_piutang > 0 && (
            <Button onClick={() => router.push('/dashboard/admin/piutang')}>
              <Wallet className="w-4 h-4 mr-2" /> Ke Piutang
            </Button>
          )}
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

    </div>
  );
}
