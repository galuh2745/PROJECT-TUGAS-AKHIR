'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, FileDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

interface Perusahaan { id: string; nama_perusahaan: string; }
interface AyamMati { id: string; perusahaan_id: string; perusahaan: Perusahaan; tanggal: string; jumlah_ekor: number; keterangan: string | null; status_claim: 'BISA_CLAIM' | 'TIDAK_BISA'; created_at: string; }
interface RekapData { per_perusahaan: { perusahaan_id: string; nama_perusahaan: string; bisa_claim: { jumlah_record: number; total_ekor: number }; tidak_bisa_claim: { jumlah_record: number; total_ekor: number }; total: { jumlah_record: number; total_ekor: number } }[]; total: { bisa_claim_ekor: number; tidak_bisa_claim_ekor: number; total_ekor: number } }

export default function AyamMatiPage() {
  const [data, setData] = useState<AyamMati[]>([]);
  const [rekapData, setRekapData] = useState<RekapData | null>(null);
  const [perusahaanList, setPerusahaanList] = useState<Perusahaan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('data');
  const [filterPerusahaan, setFilterPerusahaan] = useState('');
  const [filterTanggalDari, setFilterTanggalDari] = useState('');
  const [filterTanggalSampai, setFilterTanggalSampai] = useState('');
  const [filterStatusClaim, setFilterStatusClaim] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedData, setSelectedData] = useState<AyamMati | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ perusahaan_id: '', tanggal: '', jumlah_ekor: '', keterangan: '' });

  useEffect(() => { fetchPerusahaan(); }, []);
  useEffect(() => { activeTab === 'data' ? fetchData() : fetchRekap(); }, [activeTab, filterPerusahaan, filterTanggalDari, filterTanggalSampai, filterStatusClaim]);

  const fetchPerusahaan = async () => { try { const r = await fetch('/api/inventory/perusahaan', { credentials: 'include' }); const res = await r.json(); if (res.success) setPerusahaanList(res.data); } catch {} };
  const fetchData = async () => {
    try { setLoading(true); const p = new URLSearchParams(); if (filterPerusahaan) p.set('perusahaan_id', filterPerusahaan); if (filterTanggalDari) p.set('tanggal_dari', filterTanggalDari); if (filterTanggalSampai) p.set('tanggal_sampai', filterTanggalSampai); if (filterStatusClaim) p.set('status_claim', filterStatusClaim);
      const r = await fetch(`/api/inventory/ayam-mati?${p}`, { credentials: 'include' }); const res = await r.json(); if (res.success) setData(res.data); else toast.error(res.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };
  const fetchRekap = async () => {
    try { setLoading(true); const p = new URLSearchParams(); if (filterPerusahaan) p.set('perusahaan_id', filterPerusahaan); if (filterTanggalDari) p.set('tanggal_dari', filterTanggalDari); if (filterTanggalSampai) p.set('tanggal_sampai', filterTanggalSampai);
      const r = await fetch(`/api/inventory/ayam-mati/rekap?${p}`, { credentials: 'include' }); const res = await r.json(); if (res.success) setRekapData(res.data); else toast.error(res.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  const openAddModal = () => { setModalMode('add'); const now = new Date(); const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; setFormData({ perusahaan_id: '', tanggal: localDate, jumlah_ekor: '', keterangan: '' }); setSelectedData(null); setShowModal(true); };
  const openEditModal = (item: AyamMati) => { setModalMode('edit'); setFormData({ perusahaan_id: item.perusahaan_id, tanggal: item.tanggal, jumlah_ekor: item.jumlah_ekor.toString(), keterangan: item.keterangan || '' }); setSelectedData(item); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const method = modalMode === 'add' ? 'POST' : 'PUT';
      const body = { ...(modalMode === 'edit' && { id: selectedData?.id }), ...formData, jumlah_ekor: parseInt(formData.jumlah_ekor) };
      const r = await fetch('/api/inventory/ayam-mati', { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const res = await r.json(); if (res.success) { toast.success('Data berhasil disimpan'); setShowModal(false); fetchData(); } else toast.error(res.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    try { const r = await fetch(`/api/inventory/ayam-mati?id=${id}`, { method: 'DELETE', credentials: 'include' }); const res = await r.json(); if (res.success) { toast.success('Data berhasil dihapus'); fetchData(); } else toast.error(res.error); } catch { toast.error('Terjadi kesalahan'); }
  };

  const fmtN = (v: number) => new Intl.NumberFormat('id-ID').format(v);
  const predictedStatus = formData.jumlah_ekor && parseInt(formData.jumlah_ekor) >= 10 ? 'BISA_CLAIM' : 'TIDAK_BISA';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Ayam Mati</h1><p className="text-muted-foreground text-sm mt-1">Pencatatan ayam mati dalam perjalanan dan rekap klaim</p></div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList><TabsTrigger value="data">Data Ayam Mati</TabsTrigger><TabsTrigger value="rekap">Rekap Klaim</TabsTrigger></TabsList>

        {/* Filters */}
        <Card className="mt-4"><CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:flex-1 space-y-2"><Label>Perusahaan</Label><select value={filterPerusahaan} onChange={(e) => setFilterPerusahaan(e.target.value)} className={selectClass}><option value="">Semua</option>{perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}</select></div>
            <div className="w-full md:flex-1 space-y-2"><Label>Tanggal Dari</Label><input type="date" value={filterTanggalDari} onChange={(e) => setFilterTanggalDari(e.target.value)} className={selectClass} /></div>
            <div className="w-full md:flex-1 space-y-2"><Label>Tanggal Sampai</Label><input type="date" value={filterTanggalSampai} onChange={(e) => setFilterTanggalSampai(e.target.value)} className={selectClass} /></div>
            {activeTab === 'data' && <div className="w-full md:flex-1 space-y-2"><Label>Status Klaim</Label><select value={filterStatusClaim} onChange={(e) => setFilterStatusClaim(e.target.value)} className={selectClass}><option value="">Semua</option><option value="BISA_CLAIM">Bisa Klaim</option><option value="TIDAK_BISA">Tidak Bisa</option></select></div>}
            <div className="flex gap-2 shrink-0">
              {activeTab === 'data' && <Button onClick={openAddModal}><Plus className="w-4 h-4 mr-2" /> Tambah Data</Button>}
              <Button variant="outline" className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700" onClick={() => { const p = new URLSearchParams(); if (filterPerusahaan) p.set('perusahaan_id', filterPerusahaan); if (filterTanggalDari) p.set('tanggal_dari', filterTanggalDari); if (filterTanggalSampai) p.set('tanggal_sampai', filterTanggalSampai); window.open(`/api/inventory/ayam-mati/pdf?${p}`, '_blank'); }}><FileDown className="w-4 h-4 mr-2" /> PDF</Button>
            </div>
          </div>
        </CardContent></Card>

        <TabsContent value="data">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tanggal</TableHead><TableHead>Perusahaan</TableHead><TableHead className="text-right">Jumlah Ekor</TableHead><TableHead>Status Klaim</TableHead><TableHead>Keterangan</TableHead><TableHead>Aksi</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Memuat data...</TableCell></TableRow>
                : data.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Belum ada data</TableCell></TableRow>
                : data.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{item.tanggal}</TableCell>
                    <TableCell>{item.perusahaan.nama_perusahaan}</TableCell>
                    <TableCell className="text-right">{fmtN(item.jumlah_ekor)}</TableCell>
                    <TableCell><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${item.status_claim === 'BISA_CLAIM' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{item.status_claim === 'BISA_CLAIM' ? 'Bisa Klaim' : 'Tidak Bisa'}</span></TableCell>
                    <TableCell className="text-muted-foreground">{item.keterangan || '-'}</TableCell>
                    <TableCell><div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => openEditModal(item)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="rekap">
          {rekapData && (
            <div className="space-y-4">
              <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StaggerItem><Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Ayam Mati</p><p className="text-3xl font-bold mt-2">{fmtN(rekapData.total.total_ekor)} ekor</p></CardContent></Card></StaggerItem>
                <StaggerItem><Card className="bg-emerald-50/50"><CardContent className="pt-6"><p className="text-sm text-emerald-700">Bisa Diklaim</p><p className="text-3xl font-bold text-emerald-600 mt-2">{fmtN(rekapData.total.bisa_claim_ekor)} ekor</p></CardContent></Card></StaggerItem>
                <StaggerItem><Card className="bg-red-50/50"><CardContent className="pt-6"><p className="text-sm text-red-700">Tidak Bisa Diklaim</p><p className="text-3xl font-bold text-red-600 mt-2">{fmtN(rekapData.total.tidak_bisa_claim_ekor)} ekor</p></CardContent></Card></StaggerItem>
              </StaggerContainer>

              <Card><CardHeader><CardTitle className="text-base">Rekap per Perusahaan</CardTitle></CardHeader><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Perusahaan</TableHead><TableHead className="text-right">Bisa Klaim (Ekor)</TableHead><TableHead className="text-right">Tidak Bisa (Ekor)</TableHead><TableHead className="text-right">Total Record</TableHead><TableHead className="text-right">Total Ekor</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {loading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Memuat rekap...</TableCell></TableRow>
                    : !rekapData || rekapData.per_perusahaan.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada data</TableCell></TableRow>
                    : rekapData.per_perusahaan.map(item => (
                      <TableRow key={item.perusahaan_id}>
                        <TableCell className="font-medium">{item.nama_perusahaan}</TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">{fmtN(item.bisa_claim.total_ekor)}</TableCell>
                        <TableCell className="text-right text-red-600 font-medium">{fmtN(item.tidak_bisa_claim.total_ekor)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{item.total.jumlah_record}</TableCell>
                        <TableCell className="text-right font-medium">{fmtN(item.total.total_ekor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>

              <Card className="border-amber-200 bg-amber-50/50"><CardContent className="pt-6 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm"><p className="font-medium text-amber-800">Ketentuan Klaim</p><p className="text-amber-700 mt-1">Ayam mati BISA DIKLAIM jika jumlah ekor &gt;= 10. Ayam mati &lt; 10 ekor TIDAK BISA diklaim ke perusahaan supplier.</p></div>
              </CardContent></Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{modalMode === 'add' ? 'Tambah Ayam Mati' : 'Edit Ayam Mati'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label>Perusahaan <span className="text-red-500">*</span></Label><select value={formData.perusahaan_id} onChange={(e) => setFormData({ ...formData, perusahaan_id: e.target.value })} className={selectClass} required><option value="">Pilih Perusahaan</option>{perusahaanList.map(p => <option key={p.id} value={p.id}>{p.nama_perusahaan}</option>)}</select></div>
            <div className="space-y-2"><Label>Tanggal <span className="text-red-500">*</span></Label><input type="date" value={formData.tanggal} onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })} className={selectClass} required /></div>
            <div className="space-y-2">
              <Label>Jumlah Ekor <span className="text-red-500">*</span></Label>
              <Input type="number" value={formData.jumlah_ekor} onChange={(e) => setFormData({ ...formData, jumlah_ekor: e.target.value })} required min={1} />
              {formData.jumlah_ekor && <p className={`text-sm ${predictedStatus === 'BISA_CLAIM' ? 'text-emerald-600' : 'text-red-600'}`}>Status: {predictedStatus === 'BISA_CLAIM' ? 'Bisa Diklaim' : 'Tidak Bisa Diklaim'}</p>}
            </div>
            <div className="space-y-2"><Label>Keterangan</Label><Textarea value={formData.keterangan} onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })} rows={3} placeholder="Keterangan tambahan (opsional)" /></div>
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
