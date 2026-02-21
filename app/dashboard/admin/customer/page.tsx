'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, Eye, Users, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

interface Customer {
  id: string;
  nama: string;
  no_hp: string | null;
  alamat: string | null;
  created_at: string;
  total_piutang: number;
}

const formatRupiah = (num: number): string => {
  const prefix = num < 0 ? '-Rp ' : 'Rp ';
  return prefix + Math.abs(num).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

export default function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ nama: '', no_hp: '', alamat: '' });

  useEffect(() => { fetchCustomers(); }, [search]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const response = await fetch(`/api/customer?${params}`, { credentials: 'include' });
      const result = await response.json();
      if (result.success) setCustomers(result.data);
      else toast.error(result.error || 'Gagal memuat data');
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  const openAddModal = () => {
    setModalMode('add');
    setFormData({ nama: '', no_hp: '', alamat: '' });
    setSelectedCustomer(null);
    setShowModal(true);
  };

  const openEditModal = (c: Customer) => {
    setModalMode('edit');
    setFormData({ nama: c.nama, no_hp: c.no_hp || '', alamat: c.alamat || '' });
    setSelectedCustomer(c);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = modalMode === 'add' ? '/api/customer' : `/api/customer/${selectedCustomer?.id}`;
      const method = modalMode === 'add' ? 'POST' : 'PUT';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`Customer berhasil ${modalMode === 'add' ? 'ditambahkan' : 'diperbarui'}`);
        setShowModal(false);
        fetchCustomers();
      } else {
        toast.error(result.error || 'Gagal menyimpan data');
      }
    } catch { toast.error('Terjadi kesalahan'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus customer ini?')) return;
    try {
      const response = await fetch(`/api/customer/${id}`, { method: 'DELETE', credentials: 'include' });
      const result = await response.json();
      if (result.success) {
        toast.success('Customer berhasil dihapus');
        fetchCustomers();
      } else {
        toast.error(result.error || 'Gagal menghapus data');
      }
    } catch { toast.error('Terjadi kesalahan'); }
  };

  const totalPiutangAll = customers.reduce((sum, c) => sum + c.total_piutang, 0);

  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customer</h1>
            <p className="text-sm text-muted-foreground">Kelola data customer dan pantau piutang</p>
          </div>
        </div>
      </StaggerItem>

      {/* Summary Cards */}
      <StaggerItem>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Total Customer</p>
              <p className="text-2xl font-bold">{customers.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Customer dengan Piutang</p>
              <p className="text-2xl font-bold text-amber-600">
                {customers.filter((c) => c.total_piutang > 0).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">Total Piutang Aktif</p>
              <p className="text-2xl font-bold text-red-600">{formatRupiah(totalPiutangAll)}</p>
            </CardContent>
          </Card>
        </div>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari customer..." className="pl-9" />
              </div>
              <Button onClick={openAddModal}>
                <Plus className="w-4 h-4 mr-2" /> Tambah Customer
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : customers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Belum ada data customer</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>No HP</TableHead>
                      <TableHead>Alamat</TableHead>
                      <TableHead className="text-right">Piutang</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nama}</TableCell>
                        <TableCell>{c.no_hp || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{c.alamat || '-'}</TableCell>
                        <TableCell className="text-right">
                          {c.total_piutang > 0 ? (
                            <Badge variant="destructive">{formatRupiah(c.total_piutang)}</Badge>
                          ) : (
                            <Badge variant="secondary">Lunas</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditModal(c)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-700">
                              <Trash2 className="w-4 h-4" />
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

      {/* Modal Add/Edit */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modalMode === 'add' ? 'Tambah Customer' : 'Edit Customer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Customer *</Label>
              <Input value={formData.nama} onChange={(e) => setFormData({ ...formData, nama: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>No HP</Label>
              <Input value={formData.no_hp} onChange={(e) => setFormData({ ...formData, no_hp: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Alamat</Label>
              <Textarea value={formData.alamat} onChange={(e) => setFormData({ ...formData, alamat: e.target.value })} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </StaggerContainer>
  );
}
