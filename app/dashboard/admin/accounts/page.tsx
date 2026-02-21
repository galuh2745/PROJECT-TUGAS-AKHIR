'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Users, Search, RotateCcw, Shield, UserCheck, UserX, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

interface Account {
  id: string;
  name: string;
  role: 'ADMIN' | 'OWNER' | 'USER';
  need_password_reset: boolean;
  karyawan: {
    nama: string;
    nip: string;
    jenis_karyawan: { nama_jenis: string } | null;
  } | null;
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

const roleColors: Record<string, string> = {
  ADMIN: 'bg-red-50 text-red-700 border-red-200',
  OWNER: 'bg-purple-50 text-purple-700 border-purple-200',
  USER: 'bg-blue-50 text-blue-700 border-blue-200',
};

export default function AccountsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('');

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/accounts', { credentials: 'include' });
      if (response.status === 401 || response.status === 403) { router.push('/login'); return; }
      const result = await response.json();
      if (result.success) setAccounts(result.data);
      else toast.error(result.error || 'Gagal memuat data');
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const filtered = accounts.filter(acc => {
    const matchRole = !filterRole || acc.role === filterRole;
    const matchSearch = !searchTerm ||
      (acc.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.karyawan?.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.karyawan?.nip?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchRole && matchSearch;
  });

  const adminCount = accounts.filter(a => a.role === 'ADMIN').length;
  const ownerCount = accounts.filter(a => a.role === 'OWNER').length;
  const userCount = accounts.filter(a => a.role === 'USER').length;

  if (loading) return <LoadingSpinner text="Memuat data akun..." />;

  const summaryCards = [
    { label: 'Total Akun', value: accounts.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Admin', value: adminCount, icon: Shield, color: 'text-red-600', bg: 'bg-red-100', filter: 'ADMIN' },
    { label: 'User', value: userCount, icon: UserX, color: 'text-emerald-600', bg: 'bg-emerald-100', filter: 'USER' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manajemen Akun</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola semua akun pengguna sistem</p>
      </div>

      {/* Summary Cards */}
      <StaggerContainer className="grid grid-cols-3 gap-4">
        {summaryCards.map(item => (
          <StaggerItem key={item.label}>
            <Card className={`cursor-pointer transition hover:shadow-md ${item.filter && filterRole === item.filter ? 'ring-2 ring-primary' : ''}`}
              onClick={() => item.filter ? setFilterRole(filterRole === item.filter ? '' : item.filter) : setFilterRole('')}>
              <CardContent className="flex items-center gap-3 pt-6">
                <div className={`w-10 h-10 ${item.bg} rounded-lg flex items-center justify-center`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Cari</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Username atau nama..." className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className={selectClass}>
                <option value="">Semua Role</option>
                <option value="ADMIN">Admin</option>
                <option value="OWNER">Owner</option>
                <option value="USER">User</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => { setSearchTerm(''); setFilterRole(''); }}>
                <RotateCcw className="w-4 h-4 mr-2" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Akun ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Akun</TableHead>
                <TableHead>Karyawan</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Tidak ada data akun</TableCell></TableRow>
              ) : filtered.map(acc => (
                <TableRow key={acc.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                        {(acc.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-medium">{acc.name || '-'}</span>
                        <p className="text-xs text-muted-foreground">{acc.karyawan?.nip || '-'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {acc.karyawan ? (
                      <div>
                        <div className="text-sm">{acc.karyawan.nama}</div>
                        <div className="text-xs text-muted-foreground">{acc.karyawan.nip}</div>
                      </div>
                    ) : <span className="text-muted-foreground text-sm">-</span>}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${roleColors[acc.role] || ''}`}>{acc.role}</span>
                  </TableCell>
                  <TableCell>
                    {acc.need_password_reset ? (
                      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border bg-amber-50 text-amber-700 border-amber-200">Perlu Reset</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Aktif</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
