'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, FileDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

interface Perusahaan { id: string; nama_perusahaan: string; }
interface BarangMasuk { id: string; perusahaan_id: string; perusahaan: Perusahaan; tanggal_masuk: string; jumlah_ekor: number; total_kg: number; bw: number; harga_per_kg: number; total_harga: number; tanggal_pembayaran: string | null; jumlah_transfer: number; saldo_kita: number; nomor_do: string | null; nama_kandang: string; alamat_kandang: string | null; no_mobil: string | null; nama_supir: string | null; created_at: string; }

export default function BarangMasukPage() {
  const [data, setData] = useState<BarangMasuk[]>([]);
  const [perusahaanList, setPerusahaanList] = useState<Perusahaan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPerusahaan, setFilterPerusahaan] = useState('');
  const [filterTanggalDari, setFilterTanggalDari] = useState('');
  const [filterTanggalSampai, setFilterTanggalSampai] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedData, setSelectedData] = useState<BarangMasuk | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ perusahaan_id: '', tanggal_masuk: '', jumlah_ekor: '', total_kg: '', harga_per_kg: '', tanggal_pembayaran: '', jumlah_transfer: '', nomor_do: '', nama_kandang: '', alamat_kandang: '', no_mobil: '', nama_supir: '' });

  useEffect(() => { fetchPerusahaan(); }, []);
  useEffect(() => { fetchData(); }, [filterPerusahaan, filterTanggalDari, filterTanggalSampai]);

  const fetchPerusahaan = async () => { try { const r = await fetch('/api/inventory/perusahaan', { credentials: 'include' }); const res = await r.json(); if (res.success) setPerusahaanList(res.data); } catch {} };
  const fetchData = async () => {
    try { setLoading(true); const params = new URLSearchParams(); if (filterPerusahaan) params.set('perusahaan_id', filterPerusahaan); if (filterTanggalDari) params.set('tanggal_dari', filterTanggalDari); if (filterTanggalSampai) params.set('tanggal_sampai', filterTanggalSampai);
      const r = await fetch(`/api/inventory/barang-masuk?${params}`, { credentials: 'include' }); const res = await r.json(); if (res.success) setData(res.data); else toast.error(res.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  const openAddModal = () => { setModalMode('add'); const now = new Date(); const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; setFormData({ perusahaan_id: '', tanggal_masuk: localDate, jumlah_ekor: '', total_kg: '', harga_per_kg: '', tanggal_pembayaran: '', jumlah_transfer: '0', nomor_do: '', nama_kandang: '', alamat_kandang: '', no_mobil: '', nama_supir: '' }); setSelectedData(null); setShowModal(true); };
  const openEditModal = (item: BarangMasuk) => { setModalMode('edit'); setFormData({ perusahaan_id: item.perusahaan_id, tanggal_masuk: item.tanggal_masuk, jumlah_ekor: item.jumlah_ekor.toString(), total_kg: item.total_kg.toString(), harga_per_kg: item.harga_per_kg.toString(), tanggal_pembayaran: item.tanggal_pembayaran || '', jumlah_transfer: item.jumlah_transfer.toString(), nomor_do: item.nomor_do || '', nama_kandang: item.nama_kandang, alamat_kandang: item.alamat_kandang || '', no_mobil: item.no_mobil || '', nama_supir: item.nama_supir || '' }); setSelectedData(item); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const method = modalMode === 'add' ? 'POST' : 'PUT';
      const body = { ...(modalMode === 'edit' && { id: selectedData?.id }), ...formData, jumlah_ekor: parseInt(formData.jumlah_ekor), total_kg: parseFloat(formData.total_kg), harga_per_kg: parseFloat(formData.harga_per_kg), jumlah_transfer: parseFloat(formData.jumlah_transfer) || 0 };
      const r = await fetch('/api/inventory/barang-masuk', { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const res = await r.json();
      if (res.success) { toast.success('Data berhasil disimpan'); setShowModal(false); fetchData(); } else toast.error(res.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    try { const r = await fetch(`/api/inventory/barang-masuk?id=${id}`, { method: 'DELETE', credentials: 'include' }); const res = await r.json(); if (res.success) { toast.success('Data berhasil dihapus'); fetchData(); } else toast.error(res.error); } catch { toast.error('Terjadi kesalahan'); }
  };

  const fmtC = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);
  const fmtN = (v: number) => new Intl.NumberFormat('id-ID').format(v);

  const calculatedBW = formData.jumlah_ekor && formData.total_kg ? (parseFloat(formData.total_kg) / parseInt(formData.jumlah_ekor)).toFixed(3) : '0';
  const calculatedTotalHarga = formData.harga_per_kg && formData.total_kg ? parseFloat(formData.harga_per_kg) * parseFloat(formData.total_kg) : 0;
  const calculatedSaldoKita = calculatedTotalHarga - (parseFloat(formData.jumlah_transfer) || 0);

  const summary = useMemo(() => data.reduce((a, i) => ({ totalEkor: a.totalEkor + i.jumlah_ekor, totalKg: a.totalKg + i.total_kg, totalHarga: a.totalHarga + i.total_harga, totalTransfer: a.totalTransfer + i.jumlah_transfer, totalSaldo: a.totalSaldo + i.saldo_kita }), { totalEkor: 0, totalKg: 0, totalHarga: 0, totalTransfer: 0, totalSaldo: 0 }), [data]);

  const summaryCards = [
    { label: 'Total Ekor', value: fmtN(summary.totalEkor), border: 'border-l-blue-500' },
    { label: 'Total Kg', value: fmtN(summary.totalKg), border: 'border-l-emerald-500' },
    { label: 'Total Harga', value: fmtC(summary.totalHarga), border: 'border-l-purple-500', color: 'text-blue-600' },
    { label: 'Total Transfer', value: fmtC(summary.totalTransfer), border: 'border-l-orange-500', color: 'text-emerald-600' },
    { label: 'Saldo Kita', value: fmtC(summary.totalSaldo), border: 'border-l-red-500', color: summary.totalSaldo > 0 ? 'text-red-600' : 'text-emerald-600' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Barang Masuk</h1><p className="text-muted-foreground text-sm mt-1">Pencatatan ayam hidup masuk dari perusahaan supplier</p></div>

      <Card><CardContent className="pt-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:flex-1 space-y-2"><Label>Perusahaan</Label><select value={filterPerusahaan} onChange={(e) => setFilterPerusahaan(e.target.value)} className={selectClass}><option value="">Semua Perusahaan</option>{perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}</select></div>
          <div className="w-full md:flex-1 space-y-2"><Label>Tanggal Dari</Label><input type="date" value={filterTanggalDari} onChange={(e) => setFilterTanggalDari(e.target.value)} className={selectClass} /></div>
          <div className="w-full md:flex-1 space-y-2"><Label>Tanggal Sampai</Label><input type="date" value={filterTanggalSampai} onChange={(e) => setFilterTanggalSampai(e.target.value)} className={selectClass} /></div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={openAddModal}><Plus className="w-4 h-4 mr-2" /> Tambah Data</Button>
            <Button variant="outline" className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700" onClick={() => { const p = new URLSearchParams(); if (filterPerusahaan) p.set('perusahaan_id', filterPerusahaan); if (filterTanggalDari) p.set('tanggal_dari', filterTanggalDari); if (filterTanggalSampai) p.set('tanggal_sampai', filterTanggalSampai); window.open(`/api/inventory/barang-masuk/pdf?${p}`, '_blank'); }}><FileDown className="w-4 h-4 mr-2" /> PDF</Button>
          </div>
        </div>
      </CardContent></Card>

      <StaggerContainer className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {summaryCards.map(c => <StaggerItem key={c.label}><Card className={`border-l-4 ${c.border}`}><CardContent className="pt-4"><p className="text-sm text-muted-foreground">{c.label}</p><p className={`text-xl font-bold ${c.color || 'text-foreground'}`}>{c.value}</p></CardContent></Card></StaggerItem>)}
      </StaggerContainer>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tanggal</TableHead><TableHead>Perusahaan</TableHead><TableHead>No DO</TableHead><TableHead>Kandang</TableHead><TableHead>No Mobil</TableHead><TableHead>Supir</TableHead>
              <TableHead className="text-right">Ekor</TableHead><TableHead className="text-right">Kg</TableHead><TableHead className="text-right">BW</TableHead>
              <TableHead className="text-right">Harga/Kg</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Transfer</TableHead>
              <TableHead className="text-right">Saldo</TableHead><TableHead>Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">Memuat data...</TableCell></TableRow>
              : data.length === 0 ? <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">Belum ada data</TableCell></TableRow>
              : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{item.tanggal_masuk}</TableCell>
                  <TableCell className="whitespace-nowrap">{item.perusahaan.nama_perusahaan}</TableCell>
                  <TableCell>{item.nomor_do || '-'}</TableCell>
                  <TableCell>{item.nama_kandang}</TableCell>
                  <TableCell>{item.no_mobil || '-'}</TableCell>
                  <TableCell>{item.nama_supir || '-'}</TableCell>
                  <TableCell className="text-right">{fmtN(item.jumlah_ekor)}</TableCell>
                  <TableCell className="text-right">{fmtN(item.total_kg)}</TableCell>
                  <TableCell className="text-right">{item.bw.toFixed(3)}</TableCell>
                  <TableCell className="text-right">{fmtC(item.harga_per_kg)}</TableCell>
                  <TableCell className="text-right">{fmtC(item.total_harga)}</TableCell>
                  <TableCell className="text-right">{fmtC(item.jumlah_transfer)}</TableCell>
                  <TableCell className={`text-right font-medium ${item.saldo_kita > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtC(item.saldo_kita)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => openEditModal(item)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modalMode === 'add' ? 'Tambah Barang Masuk' : 'Edit Barang Masuk'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Perusahaan <span className="text-red-500">*</span></Label><select value={formData.perusahaan_id} onChange={(e) => setFormData({ ...formData, perusahaan_id: e.target.value })} className={selectClass} required><option value="">Pilih Perusahaan</option>{perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}</select></div>
              <div className="space-y-2"><Label>Tanggal Masuk <span className="text-red-500">*</span></Label><input type="date" value={formData.tanggal_masuk} onChange={(e) => setFormData({ ...formData, tanggal_masuk: e.target.value })} className={selectClass} required /></div>
              <div className="space-y-2"><Label>Jumlah Ekor <span className="text-red-500">*</span></Label><Input type="number" value={formData.jumlah_ekor} onChange={(e) => setFormData({ ...formData, jumlah_ekor: e.target.value })} required min={1} /></div>
              <div className="space-y-2"><Label>Total Kg <span className="text-red-500">*</span></Label><Input type="number" step="0.01" value={formData.total_kg} onChange={(e) => setFormData({ ...formData, total_kg: e.target.value })} required min={0.01} /></div>
              <div className="space-y-2"><Label>BW (Otomatis)</Label><Input value={calculatedBW} disabled className="bg-muted" /></div>
              <div className="space-y-2"><Label>Harga per Kg <span className="text-red-500">*</span></Label><Input type="number" value={formData.harga_per_kg} onChange={(e) => setFormData({ ...formData, harga_per_kg: e.target.value })} required min={1} /></div>
              <div className="space-y-2"><Label>Total Harga (Otomatis)</Label><Input value={fmtC(calculatedTotalHarga)} disabled className="bg-muted" /></div>
              <div className="space-y-2"><Label>Jumlah Transfer</Label><Input type="number" value={formData.jumlah_transfer} onChange={(e) => setFormData({ ...formData, jumlah_transfer: e.target.value })} min={0} /></div>
              <div className="space-y-2"><Label>Saldo Kita (Otomatis)</Label><Input value={fmtC(calculatedSaldoKita)} disabled className={`bg-muted ${calculatedSaldoKita > 0 ? 'text-red-600' : 'text-emerald-600'}`} /></div>
              <div className="space-y-2"><Label>Tanggal Pembayaran</Label><input type="date" value={formData.tanggal_pembayaran} onChange={(e) => setFormData({ ...formData, tanggal_pembayaran: e.target.value })} className={selectClass} /></div>
              <div className="space-y-2"><Label>Nomor DO</Label><Input value={formData.nomor_do} onChange={(e) => setFormData({ ...formData, nomor_do: e.target.value })} placeholder="Masukkan Nomor DO" /></div>
              <div className="space-y-2"><Label>Nama Kandang <span className="text-red-500">*</span></Label><Input value={formData.nama_kandang} onChange={(e) => setFormData({ ...formData, nama_kandang: e.target.value })} required /></div>
              <div className="space-y-2 md:col-span-2"><Label>Alamat Kandang</Label><Textarea value={formData.alamat_kandang} onChange={(e) => setFormData({ ...formData, alamat_kandang: e.target.value })} rows={2} /></div>
              <div className="space-y-2"><Label>No Mobil</Label><Input value={formData.no_mobil} onChange={(e) => setFormData({ ...formData, no_mobil: e.target.value })} /></div>
              <div className="space-y-2"><Label>Nama Supir</Label><Input value={formData.nama_supir} onChange={(e) => setFormData({ ...formData, nama_supir: e.target.value })} /></div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>Batal</Button>
              <Button type="submit" disabled={submitting}>{submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</> : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
