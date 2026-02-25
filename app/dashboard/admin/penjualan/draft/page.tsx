'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, RefreshCw, CheckCircle, Eye, Package, Printer, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

interface DraftDetail {
  id: string;
  tipe: string | null;
  jenis_daging: string | null;
  ekor: number | null;
  berat: number;
  harga: number;
  subtotal: number;
}

interface DraftPenjualan {
  id: string;
  customer: { id: string; nama: string; no_hp: string | null };
  tanggal: string;
  jenis_transaksi: string;
  total_penjualan: number;
  pengeluaran: number;
  grand_total: number;
  status: string;
  keterangan: string | null;
  detail: DraftDetail[];
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

export default function DraftPenjualanPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftPenjualan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFinalisasi, setShowFinalisasi] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<DraftPenjualan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cetakSekarang, setCetakSekarang] = useState(true);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [finalisasiResult, setFinalisasiResult] = useState<{ nomorNota: string; penjualanId: string; status: string } | null>(null);

  const fetchDrafts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/penjualan/draft', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setDrafts(json.data);
      else toast.error(json.error || 'Gagal memuat data');
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  const openFinalisasi = (draft: DraftPenjualan) => {
    setSelectedDraft(draft);
    setCetakSekarang(true);
    setShowFinalisasi(true);
  };

  const handleFinalisasi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDraft) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/penjualan/${selectedDraft.id}/finalisasi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        setShowFinalisasi(false);

        if (cetakSekarang) {
          // Langsung cetak
          window.open(`/penjualan/${selectedDraft.id}/print`, '_blank');
          toast.success(`Transaksi difinalisasi! Nota: ${json.data.nomor_nota}`);
          fetchDrafts();
        } else {
          // Tampilkan dialog sukses dengan opsi
          setFinalisasiResult({
            nomorNota: json.data.nomor_nota,
            penjualanId: selectedDraft.id,
            status: json.data.status,
          });
          setShowSuccessDialog(true);
          fetchDrafts();
        }
      } else {
        toast.error(json.error || 'Gagal memfinalisasi');
      }
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  const totalDrafts = drafts.length;
  const totalNilai = drafts.reduce((s, d) => s + d.grand_total, 0);

  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <FileText className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Transaksi Draft</h1>
            <p className="text-sm text-muted-foreground">Transaksi yang belum difinalisasi & dicetak</p>
          </div>
        </div>
      </StaggerItem>

      {/* Info Banner */}
      <StaggerItem>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Cara kerja sistem:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Input barang keluar di <strong>Inventory → Barang Keluar</strong></li>
                <li>Draft transaksi otomatis muncul disini</li>
                <li>Finalisasi & cetak nota untuk menghasilkan nomor nota</li>
                <li>Pembayaran dilakukan melalui menu <strong>Piutang</strong></li>
              </ol>
            </div>
          </div>
        </div>
      </StaggerItem>

      {/* Summary */}
      <StaggerItem>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Total Draft</p>
              <p className="text-2xl font-bold">{totalDrafts} transaksi</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Total Nilai</p>
              <p className="text-2xl font-bold text-orange-600">{formatRupiah(totalNilai)}</p>
            </CardContent>
          </Card>
        </div>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Daftar Draft</h2>
              <Button onClick={fetchDrafts} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Tidak ada transaksi draft</p>
                <p className="text-xs mt-1">Transaksi draft otomatis dibuat dari menu Inventory → Barang Keluar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap">{formatTanggal(d.tanggal)}</TableCell>
                        <TableCell className="font-medium">{d.customer.nama}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {d.jenis_transaksi === 'CAMPURAN' ? 'Campuran' :
                             d.jenis_transaksi === 'AYAM_HIDUP' ? 'Ayam Hidup' :
                             d.jenis_transaksi === 'DAGING' ? 'Daging' : d.jenis_transaksi}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {d.detail.map((det) => (
                              <div key={det.id}>
                                {det.jenis_daging || det.tipe} - {det.berat}kg × {formatRupiah(det.harga)}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatRupiah(d.grand_total)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => router.push(`/dashboard/admin/penjualan/${d.id}`)}
                              title="Lihat Detail"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => openFinalisasi(d)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Finalisasi
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

      {/* ========== Modal Finalisasi ========== */}
      <Dialog open={showFinalisasi} onOpenChange={setShowFinalisasi}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Finalisasi Transaksi</DialogTitle>
          </DialogHeader>
          {selectedDraft && (
            <form onSubmit={handleFinalisasi} className="space-y-4">
              {/* Info transaksi */}
              <div className="p-3 bg-gray-50 rounded-md space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{selectedDraft.customer.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tanggal</span>
                  <span>{formatTanggal(selectedDraft.tanggal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Penjualan</span>
                  <span>{formatRupiah(selectedDraft.total_penjualan)}</span>
                </div>
                {selectedDraft.pengeluaran > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Pengeluaran</span>
                    <span>-{formatRupiah(selectedDraft.pengeluaran)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-bold">
                  <span>Grand Total</span>
                  <span>{formatRupiah(selectedDraft.grand_total)}</span>
                </div>
              </div>

              {/* Detail item */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Detail Item</Label>
                <div className="text-sm space-y-1 p-3 bg-gray-50 rounded-md max-h-40 overflow-y-auto">
                  {selectedDraft.detail.map((det) => (
                    <div key={det.id} className="flex justify-between">
                      <span>{det.jenis_daging || det.tipe} {det.ekor ? `(${det.ekor} ekor)` : ''} - {det.berat}kg</span>
                      <span>{formatRupiah(det.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info piutang */}
              <div className="p-3 rounded-md border text-sm space-y-1 bg-amber-50 border-amber-200">
                <div className="flex justify-between">
                  <span>Status setelah finalisasi:</span>
                  <span className="font-bold text-amber-700">PIUTANG</span>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  💰 Seluruh nominal menjadi piutang. Pelunasan dilakukan melalui menu <strong>Piutang</strong>.
                </p>
              </div>

              {/* Cetak Sekarang Toggle */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <input
                  type="checkbox"
                  id="cetakSekarang"
                  checked={cetakSekarang}
                  onChange={(e) => setCetakSekarang(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="cetakSekarang" className="text-sm">
                  <span className="font-medium">Cetak nota sekarang</span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Jika tidak dicentang, nota bisa dicetak nanti di Riwayat Transaksi
                  </span>
                </label>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowFinalisasi(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                  {submitting ? 'Memproses...' : cetakSekarang ? 'Finalisasi & Cetak' : 'Finalisasi Saja'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== Dialog Sukses (jika tidak cetak langsung) ========== */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="w-5 h-5" />
              Transaksi Berhasil Difinalisasi
            </DialogTitle>
          </DialogHeader>
          {finalisasiResult && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nomor Nota</span>
                  <span className="font-bold">{finalisasiResult.nomorNota}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={
                    finalisasiResult.status === 'lunas' ? 'bg-emerald-100 text-emerald-700' :
                    finalisasiResult.status === 'sebagian' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }>
                    {finalisasiResult.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <p className="font-medium">� Perlu melakukan pembayaran?</p>
                <p className="text-xs mt-1">
                  Buka menu <strong>Piutang</strong> untuk melakukan pelunasan nota.
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSuccessDialog(false);
                    router.push(`/dashboard/admin/penjualan/${finalisasiResult.penjualanId}`);
                  }}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Lihat Detail
                </Button>
                <Button
                  onClick={() => {
                    window.open(`/penjualan/${finalisasiResult.penjualanId}/print`, '_blank');
                    setShowSuccessDialog(false);
                  }}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Cetak Nota
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowSuccessDialog(false)}
                >
                  Tutup
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </StaggerContainer>
  );
}
