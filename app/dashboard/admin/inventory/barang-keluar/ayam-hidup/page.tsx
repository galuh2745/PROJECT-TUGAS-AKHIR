'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, FileDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

interface Perusahaan { id: string; nama_perusahaan: string; }
interface Customer { id: string; nama: string; no_hp?: string; }
interface StokPerusahaan { perusahaan_id: string; nama_perusahaan: string; total_masuk: number; total_mati: number; total_keluar: number; stok_ayam_hidup: number; }
interface BarangKeluarAyamHidup {
  id: string; perusahaan_id: string; perusahaan: Perusahaan; tanggal: string; nama_customer: string;
  jumlah_ekor: number; total_kg: number; jenis_daging: 'JUMBO' | 'BESAR' | 'KECIL'; harga_per_kg: number;
  is_bubut: boolean; harga_bubut: number;
  total_penjualan: number; pengeluaran: number; total_bersih: number; created_at: string;
  nomor_nota?: string; jumlah_bayar?: number; sisa_piutang?: number; status_piutang?: string;
}

export default function BarangKeluarAyamHidupPage() {
  const [data, setData] = useState<BarangKeluarAyamHidup[]>([]);
  const [perusahaanList, setPerusahaanList] = useState<Perusahaan[]>([]);
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [stokList, setStokList] = useState<StokPerusahaan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPerusahaan, setFilterPerusahaan] = useState('');
  const [filterTanggalDari, setFilterTanggalDari] = useState('');
  const [filterTanggalSampai, setFilterTanggalSampai] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedData, setSelectedData] = useState<BarangKeluarAyamHidup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    perusahaan_id: '', tanggal: '', customer_id: '', jumlah_ekor: '', total_kg: '',
    jenis_daging: 'BESAR' as 'JUMBO' | 'BESAR' | 'KECIL', harga_per_kg: '', pengeluaran: '',
    jumlah_bayar: '', metode_pembayaran: 'CASH', tipe_pembayaran: 'hutang' as 'lunas' | 'sebagian' | 'hutang',
    is_bubut: false, harga_bubut: '',
  });

  useEffect(() => { fetchPerusahaan(); fetchStok(); fetchCustomers(); }, []);
  useEffect(() => { fetchData(); }, [filterPerusahaan, filterTanggalDari, filterTanggalSampai, filterSearch]);

  const fetchPerusahaan = async () => { try { const r = await fetch('/api/inventory/perusahaan', { credentials: 'include' }); const res = await r.json(); if (res.success) setPerusahaanList(res.data); } catch {} };
  const fetchStok = async () => { try { const r = await fetch('/api/inventory/stok', { credentials: 'include' }); const res = await r.json(); if (res.success) setStokList(res.data?.per_perusahaan || []); } catch {} };
  const fetchCustomers = async () => { try { const r = await fetch('/api/customer', { credentials: 'include' }); const res = await r.json(); if (res.success) setCustomerList(res.data); } catch {} };
  const fetchData = async () => {
    try { setLoading(true); const p = new URLSearchParams(); if (filterPerusahaan) p.set('perusahaan_id', filterPerusahaan); if (filterTanggalDari) p.set('tanggal_dari', filterTanggalDari); if (filterTanggalSampai) p.set('tanggal_sampai', filterTanggalSampai); if (filterSearch) p.set('search', filterSearch);
      const r = await fetch(`/api/inventory/barang-keluar/ayam-hidup?${p}`, { credentials: 'include' }); const res = await r.json(); if (res.success) setData(res.data); else toast.error(res.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  const getStokForPerusahaan = (pid: string) => stokList.find(s => s.perusahaan_id === pid);

  const openAddModal = () => {
    setModalMode('add'); setSelectedData(null);
    const now = new Date(); const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    setFormData({ perusahaan_id: '', tanggal: localDate, customer_id: '', jumlah_ekor: '', total_kg: '', jenis_daging: 'BESAR', harga_per_kg: '', pengeluaran: '', jumlah_bayar: '', metode_pembayaran: 'CASH', tipe_pembayaran: 'hutang' as 'lunas' | 'sebagian' | 'hutang', is_bubut: false, harga_bubut: '' });
    setShowModal(true);
  };
  const openEditModal = (item: BarangKeluarAyamHidup) => {
    setModalMode('edit'); setSelectedData(item);
    const matchedCustomer = customerList.find(c => c.nama === item.nama_customer);
    const tipePembayaran = ((item.jumlah_bayar ?? 0) === 0 ? 'hutang' : (item.jumlah_bayar ?? 0) >= item.total_penjualan ? 'lunas' : 'sebagian') as 'lunas' | 'sebagian' | 'hutang';
    setFormData({ perusahaan_id: item.perusahaan_id, tanggal: item.tanggal, customer_id: matchedCustomer?.id || '', jumlah_ekor: item.jumlah_ekor.toString(), total_kg: item.total_kg.toString(), jenis_daging: item.jenis_daging, harga_per_kg: item.harga_per_kg.toString(), pengeluaran: item.pengeluaran.toString(), jumlah_bayar: tipePembayaran === 'sebagian' ? (item.jumlah_bayar ?? 0).toString() : '', metode_pembayaran: 'CASH', tipe_pembayaran: tipePembayaran, is_bubut: item.is_bubut || false, harga_bubut: item.harga_bubut ? item.harga_bubut.toString() : '' });
    setShowModal(true);
  };

  const calculatedBiayaBubut = useMemo(() => formData.is_bubut ? (parseFloat(formData.harga_bubut) || 0) * (parseInt(formData.jumlah_ekor) || 0) : 0, [formData.is_bubut, formData.harga_bubut, formData.jumlah_ekor]);
  const calculatedTotalPenjualan = useMemo(() => ((parseFloat(formData.total_kg) || 0) * (parseFloat(formData.harga_per_kg) || 0)) + calculatedBiayaBubut, [formData.total_kg, formData.harga_per_kg, calculatedBiayaBubut]);
  const calculatedTotalBersih = useMemo(() => calculatedTotalPenjualan - (parseFloat(formData.pengeluaran) || 0), [calculatedTotalPenjualan, formData.pengeluaran]);
  const calculatedJumlahBayar = useMemo(() => {
    if (formData.tipe_pembayaran === 'hutang') return 0;
    if (formData.tipe_pembayaran === 'lunas') return calculatedTotalPenjualan;
    const val = parseFloat(formData.jumlah_bayar);
    return isNaN(val) ? 0 : val;
  }, [formData.tipe_pembayaran, formData.jumlah_bayar, calculatedTotalPenjualan]);
  const calculatedSisaPiutang = useMemo(() => Math.max(0, calculatedTotalPenjualan - calculatedJumlahBayar), [calculatedTotalPenjualan, calculatedJumlahBayar]);

  const summary = useMemo(() => ({
    totalEkor: data.reduce((s, d) => s + d.jumlah_ekor, 0),
    totalKg: data.reduce((s, d) => s + d.total_kg, 0),
    totalPenjualan: data.reduce((s, d) => s + d.total_penjualan, 0),
    totalPengeluaran: data.reduce((s, d) => s + d.pengeluaran, 0),
    totalBersih: data.reduce((s, d) => s + d.total_bersih, 0),
  }), [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const method = modalMode === 'add' ? 'POST' : 'PUT';
      const selectedCustomer = customerList.find(c => c.id === formData.customer_id);
      const body = {
        ...(modalMode === 'edit' && { id: selectedData?.id }),
        perusahaan_id: formData.perusahaan_id,
        tanggal: formData.tanggal,
        customer_id: formData.customer_id,
        nama_customer: selectedCustomer?.nama || '',
        jumlah_ekor: parseInt(formData.jumlah_ekor) || 0,
        total_kg: parseFloat(formData.total_kg) || 0,
        jenis_daging: formData.jenis_daging,
        harga_per_kg: parseFloat(formData.harga_per_kg) || 0,
        pengeluaran: parseFloat(formData.pengeluaran) || 0,
        jumlah_bayar: calculatedJumlahBayar,
        metode_pembayaran: formData.metode_pembayaran,
        is_bubut: formData.is_bubut,
        harga_bubut: formData.is_bubut ? (parseFloat(formData.harga_bubut) || 0) : 0,
      };
      const r = await fetch('/api/inventory/barang-keluar/ayam-hidup', { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const res = await r.json(); if (res.success) { toast.success('Data berhasil disimpan'); setShowModal(false); fetchData(); fetchStok(); } else toast.error(res.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    try { const r = await fetch(`/api/inventory/barang-keluar/ayam-hidup?id=${id}`, { method: 'DELETE', credentials: 'include' }); const res = await r.json(); if (res.success) { toast.success('Data berhasil dihapus'); fetchData(); fetchStok(); } else toast.error(res.error); } catch { toast.error('Terjadi kesalahan'); }
  };

  const fmtC = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  const fmtN = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v);
  const stokForForm = formData.perusahaan_id ? getStokForPerusahaan(formData.perusahaan_id) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Barang Keluar - Ayam Hidup</h1><p className="text-muted-foreground text-sm mt-1">Pencatatan penjualan ayam hidup</p></div>

      <StaggerContainer className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StaggerItem><Card className="border-l-4 border-l-indigo-500"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Ekor</p><p className="text-xl font-bold text-indigo-600 mt-1">{fmtN(summary.totalEkor)}</p></CardContent></Card></StaggerItem>
        <StaggerItem><Card className="border-l-4 border-l-purple-500"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Kg</p><p className="text-xl font-bold text-purple-600 mt-1">{fmtN(summary.totalKg)}</p></CardContent></Card></StaggerItem>
        <StaggerItem><Card className="border-l-4 border-l-blue-500"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Penjualan</p><p className="text-xl font-bold text-blue-600 mt-1">{fmtC(summary.totalPenjualan)}</p></CardContent></Card></StaggerItem>
        <StaggerItem><Card className="border-l-4 border-l-red-500"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pengeluaran</p><p className="text-xl font-bold text-red-600 mt-1">{fmtC(summary.totalPengeluaran)}</p></CardContent></Card></StaggerItem>
        <StaggerItem><Card className="border-l-4 border-l-emerald-500"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Bersih</p><p className={`text-xl font-bold mt-1 ${summary.totalBersih >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtC(summary.totalBersih)}</p></CardContent></Card></StaggerItem>
      </StaggerContainer>

      <Card><CardContent className="pt-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:flex-1 space-y-2"><Label>Perusahaan</Label><select value={filterPerusahaan} onChange={(e) => setFilterPerusahaan(e.target.value)} className={selectClass}><option value="">Semua</option>{perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}</select></div>
          <div className="w-full md:flex-1 space-y-2"><Label>Tanggal Dari</Label><input type="date" value={filterTanggalDari} onChange={(e) => setFilterTanggalDari(e.target.value)} className={selectClass} /></div>
          <div className="w-full md:flex-1 space-y-2"><Label>Tanggal Sampai</Label><input type="date" value={filterTanggalSampai} onChange={(e) => setFilterTanggalSampai(e.target.value)} className={selectClass} /></div>
          <div className="w-full md:flex-1 space-y-2"><Label>Cari Customer</Label><Input placeholder="Nama customer..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} /></div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={openAddModal}><Plus className="w-4 h-4 mr-2" /> Tambah Data</Button>
            <Button variant="outline" className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700" onClick={() => { const p = new URLSearchParams(); if (filterPerusahaan) p.set('perusahaan_id', filterPerusahaan); if (filterTanggalDari) p.set('tanggal_dari', filterTanggalDari); if (filterTanggalSampai) p.set('tanggal_sampai', filterTanggalSampai); if (filterSearch) p.set('search', filterSearch); window.open(`/api/inventory/barang-keluar/ayam-hidup/pdf?${p}`, '_blank'); }}><FileDown className="w-4 h-4 mr-2" /> PDF</Button>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tanggal</TableHead><TableHead>Perusahaan</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Ekor</TableHead><TableHead className="text-right">Kg</TableHead><TableHead>Jenis</TableHead><TableHead className="text-right">Harga/kg</TableHead><TableHead className="text-right">Penjualan</TableHead><TableHead className="text-right">Pengeluaran</TableHead><TableHead className="text-right">Bersih</TableHead><TableHead>Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Memuat data...</TableCell></TableRow>
              : data.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Belum ada data</TableCell></TableRow>
              : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{item.tanggal}</TableCell>
                  <TableCell>{item.perusahaan.nama_perusahaan}</TableCell>
                  <TableCell>{item.nama_customer}</TableCell>
                  <TableCell className="text-right">{fmtN(item.jumlah_ekor)}</TableCell>
                  <TableCell className="text-right">{fmtN(item.total_kg)}</TableCell>
                  <TableCell><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${item.jenis_daging === 'JUMBO' ? 'bg-purple-50 text-purple-700' : item.jenis_daging === 'BESAR' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{item.jenis_daging}</span></TableCell>
                  <TableCell className="text-right">{fmtC(item.harga_per_kg)}</TableCell>
                  <TableCell className="text-right">{fmtC(item.total_penjualan)}</TableCell>
                  <TableCell className="text-right text-red-600">{fmtC(item.pengeluaran)}</TableCell>
                  <TableCell className={`text-right font-medium ${item.total_bersih >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtC(item.total_bersih)}</TableCell>
                  <TableCell><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => openEditModal(item)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modalMode === 'add' ? 'Tambah Barang Keluar Ayam Hidup' : 'Edit Barang Keluar Ayam Hidup'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label>Perusahaan <span className="text-red-500">*</span></Label><select value={formData.perusahaan_id} onChange={(e) => setFormData({ ...formData, perusahaan_id: e.target.value })} className={selectClass} required><option value="">Pilih Perusahaan</option>{perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}</select></div>
            {stokForForm && (
              <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm">
                <p className="font-medium text-blue-800">Stok Tersedia:</p>
                <p className="text-blue-700">Stok Ayam Hidup: {fmtN(stokForForm.stok_ayam_hidup)} ekor</p>
                {formData.jumlah_ekor && parseInt(formData.jumlah_ekor) > stokForForm.stok_ayam_hidup && (
                  <div className="flex items-center gap-1 mt-1 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /><span className="text-xs">Jumlah melebihi stok!</span></div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tanggal <span className="text-red-500">*</span></Label><input type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} className={selectClass} required /></div>
              <div className="space-y-2">
                <Label>Customer <span className="text-red-500">*</span></Label>
                <select value={formData.customer_id} onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })} className={selectClass} required>
                  <option value="">Pilih Customer</option>
                  {customerList.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Jumlah Ekor <span className="text-red-500">*</span></Label><Input type="number" value={formData.jumlah_ekor} onChange={(e) => setFormData({ ...formData, jumlah_ekor: e.target.value })} required min={1} /></div>
              <div className="space-y-2"><Label>Total Kg <span className="text-red-500">*</span></Label><Input type="number" step="0.01" value={formData.total_kg} onChange={(e) => setFormData({ ...formData, total_kg: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Jenis Daging <span className="text-red-500">*</span></Label><select value={formData.jenis_daging} onChange={(e) => setFormData({ ...formData, jenis_daging: e.target.value as 'JUMBO' | 'BESAR' | 'KECIL' })} className={selectClass} required><option value="JUMBO">Jumbo</option><option value="BESAR">Besar</option><option value="KECIL">Kecil</option></select></div>
              <div className="space-y-2"><Label>Harga per Kg <span className="text-red-500">*</span></Label><Input type="number" value={formData.harga_per_kg} onChange={(e) => setFormData({ ...formData, harga_per_kg: e.target.value })} required /></div>
            </div>
            <div className="space-y-2"><Label>Pengeluaran</Label><Input type="number" value={formData.pengeluaran} onChange={(e) => setFormData({ ...formData, pengeluaran: e.target.value })} min={0} /></div>

            {/* Bubut Section */}
            <div className="rounded-md border border-purple-200 bg-purple-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-blue-800 text-sm">Bubut (Cabut Bulu)</p>
                <button type="button" onClick={() => setFormData({ ...formData, is_bubut: !formData.is_bubut, harga_bubut: '' })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.is_bubut ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_bubut ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {formData.is_bubut && (
                <div className="space-y-2">
                  <Label className="text-xs">Harga Bubut per Ekor <span className="text-red-500">*</span></Label>
                  <Input type="number" placeholder="Masukkan harga bubut per ekor" value={formData.harga_bubut} onChange={(e) => setFormData({ ...formData, harga_bubut: e.target.value })} min={1} required />
                  {formData.harga_bubut && formData.jumlah_ekor && (
                    <p className="text-xs text-blue-600 font-medium">Total biaya bubut: {fmtC((parseFloat(formData.harga_bubut) || 0) * (parseInt(formData.jumlah_ekor) || 0))} ({formData.jumlah_ekor} ekor × {fmtC(parseFloat(formData.harga_bubut) || 0)})</p>
                  )}
                </div>
              )}
            </div>

            {/* Payment Section */}
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <p className="font-semibold text-amber-800 text-sm">Pembayaran</p>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(['lunas', 'sebagian', 'hutang'] as const).map((tipe) => (
                    <button key={tipe} type="button" onClick={() => setFormData({ ...formData, tipe_pembayaran: tipe, jumlah_bayar: '' })}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-colors ${formData.tipe_pembayaran === tipe
                        ? tipe === 'lunas' ? 'bg-emerald-100 border-emerald-500 text-emerald-700'
                          : tipe === 'sebagian' ? 'bg-blue-100 border-blue-500 text-blue-700'
                          : 'bg-red-100 border-red-500 text-red-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {tipe === 'lunas' ? 'Bayar Lunas' : tipe === 'sebagian' ? 'Bayar Sebagian' : 'Hutang Penuh'}
                    </button>
                  ))}
                </div>
                {formData.tipe_pembayaran === 'sebagian' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Jumlah Bayar</Label>
                    <Input type="number" placeholder="Masukkan jumlah bayar" value={formData.jumlah_bayar} onChange={(e) => setFormData({ ...formData, jumlah_bayar: e.target.value })} min={1} max={calculatedTotalPenjualan} required />
                  </div>
                )}
                {formData.tipe_pembayaran !== 'hutang' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Metode Pembayaran</Label>
                    <select value={formData.metode_pembayaran} onChange={(e) => setFormData({ ...formData, metode_pembayaran: e.target.value })} className={selectClass}>
                      <option value="CASH">Cash</option>
                      <option value="TRANSFER">Transfer</option>
                      <option value="CAMPUR">Campur</option>
                    </select>
                  </div>
                )}
                {formData.tipe_pembayaran === 'hutang' && (
                  <p className="text-xs text-red-600 font-medium">Customer tidak membayar, seluruh transaksi menjadi piutang</p>
                )}
              </div>
            </div>

            <Card className="bg-muted/50"><CardContent className="pt-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>Harga Ayam ({formData.total_kg || 0} kg × {fmtC(parseFloat(formData.harga_per_kg) || 0)}):</span><span className="font-medium">{fmtC((parseFloat(formData.total_kg) || 0) * (parseFloat(formData.harga_per_kg) || 0))}</span></div>
              {formData.is_bubut && calculatedBiayaBubut > 0 && (
                <div className="flex justify-between"><span>Biaya Bubut ({formData.jumlah_ekor || 0} ekor × {fmtC(parseFloat(formData.harga_bubut) || 0)}):</span><span className="font-medium text-blue-600">{fmtC(calculatedBiayaBubut)}</span></div>
              )}
              <div className="flex justify-between border-t pt-1"><span className="font-semibold">Total Penjualan:</span><span className="font-bold text-blue-600">{fmtC(calculatedTotalPenjualan)}</span></div>
              <div className="flex justify-between"><span>Pengeluaran:</span><span className="text-red-600">{fmtC(parseFloat(formData.pengeluaran) || 0)}</span></div>
              <div className="flex justify-between border-t pt-1"><span className="font-medium">Total Bersih:</span><span className={`font-bold ${calculatedTotalBersih >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtC(calculatedTotalBersih)}</span></div>
              <div className="flex justify-between border-t pt-1"><span>Jumlah Bayar:</span><span className="font-bold text-emerald-600">{fmtC(calculatedJumlahBayar)}</span></div>
              {calculatedSisaPiutang > 0 && (
                <div className="flex justify-between"><span>Sisa Piutang:</span><span className="font-bold text-amber-600">{fmtC(calculatedSisaPiutang)}</span></div>
              )}
            </CardContent></Card>

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
