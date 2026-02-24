'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface Perusahaan { id: string; nama_perusahaan: string; alamat: string | null; kontak: string | null; created_at: string; updated_at: string; }

export default function MasterPerusahaanPage() {
  const [perusahaan, setPerusahaan] = useState<Perusahaan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedPerusahaan, setSelectedPerusahaan] = useState<Perusahaan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ nama_perusahaan: '', alamat: '', kontak: '' });

  useEffect(() => {
  const delayDebounce = setTimeout(() => {
    fetchPerusahaan();
  }, 500); // delay 500ms

  return () => clearTimeout(delayDebounce);
}, [search]);

  const fetchPerusahaan = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const response = await fetch(`/api/inventory/perusahaan?${params}`, { credentials: 'include' });
      const result = await response.json();
      if (result.success) setPerusahaan(result.data);
      else toast.error(result.error || 'Gagal memuat data');
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  const openAddModal = () => { setModalMode('add'); setFormData({ nama_perusahaan: '', alamat: '', kontak: '' }); setSelectedPerusahaan(null); setShowModal(true); };
  const openEditModal = (p: Perusahaan) => { setModalMode('edit'); setFormData({ nama_perusahaan: p.nama_perusahaan, alamat: p.alamat || '', kontak: p.kontak || '' }); setSelectedPerusahaan(p); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const method = modalMode === 'add' ? 'POST' : 'PUT';
      const body = modalMode === 'add' ? formData : { ...formData, id: selectedPerusahaan?.id };
      const response = await fetch('/api/inventory/perusahaan', { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const result = await response.json();
      if (result.success) { toast.success(`Perusahaan berhasil ${modalMode === 'add' ? 'ditambahkan' : 'diperbarui'}`); setShowModal(false); fetchPerusahaan(); }
      else toast.error(result.error || 'Gagal menyimpan data');
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus perusahaan ini?')) return;
    try {
      const response = await fetch(`/api/inventory/perusahaan?id=${id}`, { method: 'DELETE', credentials: 'include' });
      const result = await response.json();
      if (result.success) { toast.success('Perusahaan berhasil dihapus'); fetchPerusahaan(); }
      else toast.error(result.error || 'Gagal menghapus data');
    } catch { toast.error('Terjadi kesalahan'); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Master Perusahaan</h1><p className="text-muted-foreground text-sm mt-1">Kelola data perusahaan supplier ayam</p></div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama perusahaan..." className="pl-9" />
            </div>
            <Button onClick={openAddModal}><Plus className="w-4 h-4 mr-2" /> Tambah Perusahaan</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>No</TableHead><TableHead>Nama Perusahaan</TableHead><TableHead>Alamat</TableHead><TableHead>Kontak</TableHead><TableHead>Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Memuat data...</TableCell></TableRow>
              ) : perusahaan.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada data perusahaan</TableCell></TableRow>
              ) : perusahaan.map((p, idx) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{p.nama_perusahaan}</TableCell>
                  <TableCell className="text-muted-foreground">{p.alamat || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{p.kontak || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => openEditModal(p)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{modalMode === 'add' ? 'Tambah Perusahaan' : 'Edit Perusahaan'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label>Nama Perusahaan <span className="text-red-500">*</span></Label><Input value={formData.nama_perusahaan} onChange={(e) => setFormData({ ...formData, nama_perusahaan: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Alamat</Label><Textarea value={formData.alamat} onChange={(e) => setFormData({ ...formData, alamat: e.target.value })} rows={3} /></div>
            <div className="space-y-2"><Label>Kontak</Label><Input value={formData.kontak} onChange={(e) => setFormData({ ...formData, kontak: e.target.value })} placeholder="No. telepon atau email" /></div>
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
