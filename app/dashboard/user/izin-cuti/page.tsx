'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, ClipboardList, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface IzinCuti {
  id: string;
  jenis: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  alasan: string;
  status: string;
  created_at: string;
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

const statusBadge = (s: string) => {
  const m: Record<string, string> = { PENDING: 'bg-amber-50 text-amber-700 border-amber-200', APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200', REJECTED: 'bg-red-50 text-red-700 border-red-200' };
  return m[s] || 'bg-gray-50 text-gray-700 border-gray-200';
};
const jenisColors: Record<string, string> = { CUTI: 'bg-purple-50 text-purple-700 border-purple-200', IZIN: 'bg-blue-50 text-blue-700 border-blue-200', SAKIT: 'bg-orange-50 text-orange-700 border-orange-200' };

export default function IzinCutiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [riwayat, setRiwayat] = useState<IzinCuti[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm] = useState({ jenis: 'IZIN', tanggal_mulai: '', tanggal_selesai: '', alasan: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/user', { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      if (data.success) setRiwayat(data.data.riwayat.izin_cuti || []);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await fetch('/api/izin-cuti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) {
        toast.success('Pengajuan berhasil dikirim!');
        setShowModal(false);
        setForm({ jenis: 'IZIN', tanggal_mulai: '', tanggal_selesai: '', alasan: '' });
        fetchData();
      } else toast.error(data.message || 'Gagal mengajukan');
    } catch { toast.error('Terjadi kesalahan'); } finally { setActionLoading(false); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  if (loading) return <LoadingSpinner text="Memuat data..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Izin & Cuti</h1>
          <p className="text-muted-foreground text-sm mt-1">Ajukan permohonan izin atau cuti</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-lg">
          <Plus className="w-4 h-4 mr-2" /> Ajukan Baru
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jenis</TableHead>
                <TableHead>Tgl Mulai</TableHead>
                <TableHead>Tgl Selesai</TableHead>
                <TableHead className="hidden sm:table-cell">Alasan</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riwayat.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                        <ClipboardList className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground text-sm">Belum ada pengajuan izin/cuti</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : riwayat.map(item => (
                <TableRow key={item.id}>
                  <TableCell><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${jenisColors[item.jenis] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>{item.jenis}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(item.tanggal_mulai)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(item.tanggal_selesai)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm max-w-xs truncate">{item.alasan}</TableCell>
                  <TableCell><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${statusBadge(item.status)}`}>{item.status === 'PENDING' ? 'Menunggu' : item.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Submit Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajukan Izin/Cuti</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Jenis</Label>
              <select value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} className={selectClass} required>
                <option value="IZIN">Izin</option>
                <option value="CUTI">Cuti</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Tanggal Mulai</Label>
              <input type="date" value={form.tanggal_mulai} onChange={(e) => setForm({ ...form, tanggal_mulai: e.target.value })} className={selectClass} required />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Selesai</Label>
              <input type="date" value={form.tanggal_selesai} onChange={(e) => setForm({ ...form, tanggal_selesai: e.target.value })} className={selectClass} required />
            </div>
            <div className="space-y-2">
              <Label>Alasan</Label>
              <Textarea value={form.alasan} onChange={(e) => setForm({ ...form, alasan: e.target.value })} rows={3} required placeholder="Tuliskan alasan pengajuan..." />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button type="submit" disabled={actionLoading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-lg">
                {actionLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</> : 'Ajukan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
