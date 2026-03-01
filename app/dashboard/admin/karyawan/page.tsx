'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Settings, Pencil, Trash2, X, Loader2, Search, RotateCcw, Eye, EyeOff
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface JenisKaryawan {
  id: string;
  nama_jenis: string;
  jam_masuk: string;
  jam_pulang: string;
  toleransi_terlambat: number;
  is_shift_malam: boolean;
  skip_jam_kerja: boolean;
  jumlah_karyawan: number;
}

interface Karyawan {
  id: string;
  user_id: string;
  nip: string;
  nama: string;
  no_hp: string;
  alamat: string;
  status: 'AKTIF' | 'NONAKTIF';
  jenis_karyawan: {
    id: string;
    nama_jenis: string;
    jam_masuk: string;
    jam_pulang: string;
  };
  created_at: string;
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default function ManajemenKaryawanPage() {
  const router = useRouter();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [jenisKaryawanList, setJenisKaryawanList] = useState<JenisKaryawan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterJenis, setFilterJenis] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showJenisModal, setShowJenisModal] = useState(false);
  const [showAddJenisModal, setShowAddJenisModal] = useState(false);
  const [showEditJenisModal, setShowEditJenisModal] = useState(false);
  const [selectedKaryawan, setSelectedKaryawan] = useState<Karyawan | null>(null);
  const [selectedJenis, setSelectedJenis] = useState<JenisKaryawan | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formKaryawan, setFormKaryawan] = useState({
    nama: '', nip: '', password: '',
    jenis_karyawan_id: '', no_hp: '', alamat: '', status: 'AKTIF',
  });

  const [formJenis, setFormJenis] = useState({
    nama_jenis: '', jam_masuk: '07:00', jam_pulang: '16:00', toleransi_terlambat: 15,
    is_shift_malam: false, skip_jam_kerja: false,
  });

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      else setRefreshing(true);

      let url = '/api/karyawan?';
      if (filterStatus) url += `status=${filterStatus}&`;
      if (filterJenis) url += `jenis_karyawan_id=${filterJenis}&`;
      if (debouncedSearch) url += `search=${debouncedSearch}&`;

      const [karyawanRes, jenisRes] = await Promise.all([
        fetch(url, { credentials: 'include' }),
        fetch('/api/jenis-karyawan', { credentials: 'include' })
      ]);

      if (karyawanRes.status === 401 || jenisRes.status === 401) { router.push('/login'); return; }

      const karyawanData = await karyawanRes.json();
      const jenisData = await jenisRes.json();

      if (karyawanData.success) setKaryawanList(karyawanData.data);
      if (jenisData.success) setJenisKaryawanList(jenisData.data);
    } catch { /* ignore */ } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedSearch(searchTerm);
  }, 500); // delay 500ms

  return () => clearTimeout(timer);
}, [searchTerm]);

  useEffect(() => { fetchData(true); }, []);
  useEffect(() => { if (!initialLoading) fetchData(); }, [filterStatus, filterJenis, debouncedSearch]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const handleSubmitKaryawan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const response = await fetch('/api/karyawan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(formKaryawan),
      });
      const result = await response.json();
      if (result.success) {
        toast.success('Karyawan berhasil ditambahkan');
        setShowAddModal(false);
        setFormKaryawan({ nama: '', nip: '', password: '', jenis_karyawan_id: '', no_hp: '', alamat: '', status: 'AKTIF' });
        fetchData();
      } else toast.error(result.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setFormLoading(false); }
  };

  const handleUpdateKaryawan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKaryawan) return;
    setFormLoading(true);
    try {
      const response = await fetch('/api/karyawan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ id: selectedKaryawan.id, ...formKaryawan }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success('Data karyawan berhasil diperbarui');
        setShowEditModal(false);
        fetchData();
      } else toast.error(result.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setFormLoading(false); }
  };

  const handleDeleteKaryawan = async (id: string, nama: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus karyawan "${nama}"? Semua data absensi akan ikut terhapus.`)) return;
    try {
      const response = await fetch(`/api/karyawan?id=${id}`, { method: 'DELETE', credentials: 'include' });
      const result = await response.json();
      if (result.success) { toast.success('Karyawan berhasil dihapus'); fetchData(); }
      else toast.error(result.error);
    } catch { toast.error('Terjadi kesalahan'); }
  };

  const handleSelectAll = () => {
    setSelectedIds(selectedIds.size === karyawanList.length ? new Set() : new Set(karyawanList.map(k => k.id)));
  };

  const handleSelectOne = (id: string) => {
    const n = new Set(selectedIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedIds(n);
  };

  const handleDeleteMultiple = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.size} karyawan?`)) return;
    setIsDeleting(true);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        const r = await fetch(`/api/karyawan?id=${id}`, { method: 'DELETE', credentials: 'include' });
        const d = await r.json();
        d.success ? ok++ : fail++;
      } catch { fail++; }
    }
    setIsDeleting(false);
    setSelectedIds(new Set());
    fail === 0 ? toast.success(`${ok} karyawan berhasil dihapus`) : toast.error(`${ok} berhasil, ${fail} gagal dihapus`);
    fetchData();
  };

  const handleSubmitJenis = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const response = await fetch('/api/jenis-karyawan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(formJenis),
      });
      const result = await response.json();
      if (result.success) {
        toast.success('Jenis karyawan berhasil ditambahkan');
        setShowAddJenisModal(false);
        setFormJenis({ nama_jenis: '', jam_masuk: '07:00', jam_pulang: '16:00', toleransi_terlambat: 15, is_shift_malam: false, skip_jam_kerja: false });
        fetchData();
      } else toast.error(result.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setFormLoading(false); }
  };

  const handleUpdateJenis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJenis) return;
    setFormLoading(true);
    try {
      const response = await fetch('/api/jenis-karyawan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ id: selectedJenis.id, ...formJenis }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success('Pengaturan jam kerja berhasil diperbarui');
        setShowEditJenisModal(false);
        fetchData();
      } else toast.error(result.error);
    } catch { toast.error('Terjadi kesalahan'); } finally { setFormLoading(false); }
  };

  const handleDeleteJenis = async (id: string, nama: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus jenis karyawan "${nama}"?`)) return;
    try {
      const response = await fetch(`/api/jenis-karyawan?id=${id}`, { method: 'DELETE', credentials: 'include' });
      const result = await response.json();
      if (result.success) { toast.success('Jenis karyawan berhasil dihapus'); fetchData(); }
      else toast.error(result.error);
    } catch { toast.error('Terjadi kesalahan'); }
  };

  const openEditModal = (karyawan: Karyawan) => {
    setSelectedKaryawan(karyawan);
    setFormKaryawan({
      nama: karyawan.nama, nip: karyawan.nip, password: '',
      jenis_karyawan_id: karyawan.jenis_karyawan.id, no_hp: karyawan.no_hp,
      alamat: karyawan.alamat, status: karyawan.status,
    });
    setShowEditModal(true);
  };

  const openEditJenisModal = (jenis: JenisKaryawan) => {
    setSelectedJenis(jenis);
    const jm = new Date(jenis.jam_masuk);
    const jp = new Date(jenis.jam_pulang);
    setFormJenis({
      nama_jenis: jenis.nama_jenis,
      jam_masuk: `${String(jm.getHours()).padStart(2, '0')}:${String(jm.getMinutes()).padStart(2, '0')}`,
      jam_pulang: `${String(jp.getHours()).padStart(2, '0')}:${String(jp.getMinutes()).padStart(2, '0')}`,
      toleransi_terlambat: jenis.toleransi_terlambat,
      is_shift_malam: jenis.is_shift_malam || false,
      skip_jam_kerja: jenis.skip_jam_kerja || false,
    });
    setShowEditJenisModal(true);
  };

  if (initialLoading) return <LoadingSpinner text="Memuat data..." />;

  /* Helper: render karyawan form fields */
  const renderKaryawanForm = (onSubmit: (e: React.FormEvent) => void, isEdit?: boolean) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Nama Lengkap *</Label><Input value={formKaryawan.nama} onChange={(e) => setFormKaryawan({ ...formKaryawan, nama: e.target.value })} required /></div>
        <div className="space-y-2"><Label>NIP *</Label><Input value={formKaryawan.nip} onChange={(e) => setFormKaryawan({ ...formKaryawan, nip: e.target.value })} required /></div>
        <div className="space-y-2">
          <Label>{isEdit ? 'Password Baru' : 'Password *'}</Label>
          <div className="relative">
            <Input type={showPassword ? 'text' : 'password'} value={formKaryawan.password} onChange={(e) => setFormKaryawan({ ...formKaryawan, password: e.target.value })} placeholder={isEdit ? 'Kosongkan jika tidak diubah' : 'Minimal 6 karakter'} required={!isEdit} minLength={6} className="pr-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Jenis Karyawan *</Label>
          <select value={formKaryawan.jenis_karyawan_id} onChange={(e) => setFormKaryawan({ ...formKaryawan, jenis_karyawan_id: e.target.value })} className={selectClass} required>
            <option value="">Pilih Jenis</option>
            {jenisKaryawanList.map((j) => <option key={j.id} value={j.id}>{j.nama_jenis}</option>)}
          </select>
        </div>
        <div className="space-y-2"><Label>No HP *</Label><Input value={formKaryawan.no_hp} onChange={(e) => setFormKaryawan({ ...formKaryawan, no_hp: e.target.value })} required /></div>
        <div className="space-y-2">
          <Label>Status</Label>
          <select value={formKaryawan.status} onChange={(e) => setFormKaryawan({ ...formKaryawan, status: e.target.value })} className={selectClass}>
            <option value="AKTIF">Aktif</option>
            <option value="NONAKTIF">Nonaktif</option>
          </select>
        </div>
      </div>
      <div className="space-y-2"><Label>Alamat *</Label><Textarea value={formKaryawan.alamat} onChange={(e) => setFormKaryawan({ ...formKaryawan, alamat: e.target.value })} rows={3} required /></div>
      <div className="flex gap-3 pt-4">
        <Button type="button" variant="outline" className="flex-1" onClick={() => isEdit ? setShowEditModal(false) : setShowAddModal(false)}>Batal</Button>
        <Button type="submit" className="flex-1" disabled={formLoading}>{formLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : isEdit ? 'Simpan Perubahan' : 'Simpan'}</Button>
      </div>
    </form>
  );

  /* Helper: render jenis form fields */
  const renderJenisForm = (onSubmit: (e: React.FormEvent) => void, isEdit?: boolean) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Nama Jenis *</Label><Input value={formJenis.nama_jenis} onChange={(e) => setFormJenis({ ...formJenis, nama_jenis: e.target.value })} placeholder="Contoh: Supir, Kurir" required /></div>
      
      {/* Opsi khusus */}
      <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
        <h4 className="text-sm font-medium text-gray-700">Opsi Khusus</h4>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={formJenis.skip_jam_kerja} onChange={(e) => setFormJenis({ ...formJenis, skip_jam_kerja: e.target.checked })} className="w-4 h-4 rounded border-gray-300" />
          <div>
            <span className="text-sm font-medium">Skip Jam Kerja (Driver/Helper)</span>
            <p className="text-xs text-muted-foreground">Hanya perlu foto & lokasi, tanpa jam masuk/pulang. Tidak ada status terlambat/alpha.</p>
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={formJenis.is_shift_malam} onChange={(e) => setFormJenis({ ...formJenis, is_shift_malam: e.target.checked })} className="w-4 h-4 rounded border-gray-300" />
          <div>
            <span className="text-sm font-medium">Shift Malam (Cross-Midnight)</span>
            <p className="text-xs text-muted-foreground">Masuk malam, pulang pagi hari berikutnya. Sistem akan mencari absensi kemarin saat checkout.</p>
          </div>
        </label>
      </div>

      {!formJenis.skip_jam_kerja && (
      <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Jam Masuk *</Label><Input type="time" value={formJenis.jam_masuk} onChange={(e) => setFormJenis({ ...formJenis, jam_masuk: e.target.value })} required /></div>
        <div className="space-y-2"><Label>Jam Pulang *</Label><Input type="time" value={formJenis.jam_pulang} onChange={(e) => setFormJenis({ ...formJenis, jam_pulang: e.target.value })} required /></div>
      </div>
      <div className="space-y-2">
        <Label>Toleransi Terlambat (menit)</Label>
        <Input type="number" value={formJenis.toleransi_terlambat} onChange={(e) => setFormJenis({ ...formJenis, toleransi_terlambat: parseInt(e.target.value) || 0 })} min={0} max={60} />
        <p className="text-xs text-muted-foreground">Absen sebelum jam masuk + toleransi = HADIR</p>
      </div>
      </>
      )}
      <div className="flex gap-3 pt-4">
        <Button type="button" variant="outline" className="flex-1" onClick={() => isEdit ? setShowEditJenisModal(false) : setShowAddJenisModal(false)}>Batal</Button>
        <Button type="submit" className="flex-1" disabled={formLoading}>{formLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : isEdit ? 'Simpan Perubahan' : 'Simpan'}</Button>
      </div>
    </form>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manajemen Karyawan</h1>
          <p className="text-muted-foreground text-sm mt-1">Kelola data karyawan dan pengaturan jam kerja</p>
        </div>
        <Button variant="ghost" onClick={() => router.push('/dashboard/admin')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => { setFormKaryawan({ nama: '', nip: '', password: '', jenis_karyawan_id: '', no_hp: '', alamat: '', status: 'AKTIF' }); setShowAddModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-lg">
          <Plus className="w-4 h-4 mr-2" /> Tambah Karyawan
        </Button>
        <Button variant="secondary" onClick={() => setShowJenisModal(true)}>
          <Settings className="w-4 h-4 mr-2" /> Pengaturan Jam Kerja
        </Button>
      </div>

      {/* Filter & Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Cari</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nama atau NIP..." className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
                <option value="">Semua Status</option>
                <option value="AKTIF">Aktif</option>
                <option value="NONAKTIF">Nonaktif</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Jenis Karyawan</Label>
              <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className={selectClass}>
                <option value="">Semua Jenis</option>
                {jenisKaryawanList.map((j) => <option key={j.id} value={j.id}>{j.nama_jenis}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => { setSearchTerm(''); setFilterStatus(''); setFilterJenis(''); }}>
                <RotateCcw className="w-4 h-4 mr-2" /> Reset Filter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Karyawan Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Daftar Karyawan ({karyawanList.length})
            {refreshing && <Loader2 className="w-4 h-4 ml-2 inline animate-spin text-muted-foreground" />}
          </CardTitle>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteMultiple} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Hapus {selectedIds.size} Terpilih
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" checked={karyawanList.length > 0 && selectedIds.size === karyawanList.length} onChange={handleSelectAll} className="w-4 h-4 rounded border-gray-300 cursor-pointer" />
                </TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead className="hidden sm:table-cell">Jenis</TableHead>
                <TableHead className="hidden lg:table-cell">No HP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {karyawanList.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Belum ada data karyawan</TableCell></TableRow>
              ) : (
                karyawanList.map((k) => (
                  <TableRow key={k.id} className={selectedIds.has(k.id) ? 'bg-blue-50' : ''}>
                    <TableCell>
                      <input type="checkbox" checked={selectedIds.has(k.id)} onChange={() => handleSelectOne(k.id)} className="w-4 h-4 rounded border-gray-300 cursor-pointer" />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{k.nip}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{k.nama}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">{k.jenis_karyawan.nama_jenis}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{k.jenis_karyawan.nama_jenis}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{k.no_hp}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${k.status === 'AKTIF' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {k.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-800" onClick={() => openEditModal(k)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-800" onClick={() => handleDeleteKaryawan(k.id, k.nama)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Tambah Karyawan */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Tambah Karyawan Baru</DialogTitle></DialogHeader>
          {renderKaryawanForm(handleSubmitKaryawan)}
        </DialogContent>
      </Dialog>

      {/* Dialog Edit Karyawan */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Karyawan</DialogTitle></DialogHeader>
          {renderKaryawanForm(handleUpdateKaryawan, true)}
        </DialogContent>
      </Dialog>

      {/* Dialog Pengaturan Jam Kerja */}
      <Dialog open={showJenisModal} onOpenChange={setShowJenisModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pengaturan Jam Kerja & Jenis Karyawan</DialogTitle></DialogHeader>
          <div className="mb-4">
            <Button variant="secondary" onClick={() => { setFormJenis({ nama_jenis: '', jam_masuk: '07:00', jam_pulang: '16:00', toleransi_terlambat: 15, is_shift_malam: false, skip_jam_kerja: false }); setShowAddJenisModal(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Tambah Jenis Karyawan
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jenis</TableHead>
                <TableHead>Jam Masuk</TableHead>
                <TableHead>Jam Pulang</TableHead>
                <TableHead>Toleransi</TableHead>
                <TableHead>Karyawan</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jenisKaryawanList.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Belum ada jenis karyawan</TableCell></TableRow>
              ) : (
                jenisKaryawanList.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">
                      {j.nama_jenis}
                      {j.skip_jam_kerja && <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">Foto & Lokasi</span>}
                      {j.is_shift_malam && <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">Shift Malam</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{j.skip_jam_kerja ? '-' : formatTime(j.jam_masuk)}</TableCell>
                    <TableCell className="text-muted-foreground">{j.skip_jam_kerja ? '-' : formatTime(j.jam_pulang)}</TableCell>
                    <TableCell className="text-muted-foreground">{j.skip_jam_kerja ? '-' : `${j.toleransi_terlambat} menit`}</TableCell>
                    <TableCell className="text-muted-foreground">{j.jumlah_karyawan} orang</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => openEditJenisModal(j)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleDeleteJenis(j.id, j.nama_jenis)} disabled={j.jumlah_karyawan > 0}><Trash2 className={`w-4 h-4 ${j.jumlah_karyawan > 0 ? 'opacity-30' : ''}`} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">Informasi Toleransi Keterlambatan</h4>
            <p className="text-sm text-blue-700">Karyawan dianggap <strong>HADIR</strong> jika absen masuk sebelum Jam Masuk + Toleransi. Contoh: Jam Masuk 07:00 dengan toleransi 15 menit → absen sebelum 07:15 = HADIR.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Tambah Jenis */}
      <Dialog open={showAddJenisModal} onOpenChange={setShowAddJenisModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Jenis Karyawan</DialogTitle></DialogHeader>
          {renderJenisForm(handleSubmitJenis)}
        </DialogContent>
      </Dialog>

      {/* Dialog Edit Jenis */}
      <Dialog open={showEditJenisModal} onOpenChange={setShowEditJenisModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Pengaturan Jam Kerja</DialogTitle></DialogHeader>
          {renderJenisForm(handleUpdateJenis, true)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
