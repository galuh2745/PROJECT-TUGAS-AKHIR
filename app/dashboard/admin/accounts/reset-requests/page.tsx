'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Clock, Mail, User, Loader2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface ResetRequest {
  id: string;
  username: string;
  karyawan: { nama: string; nip: string };
  requested_at: string;
}

export default function ResetRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ResetRequest | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/accounts/reset-requests', { credentials: 'include' });
      if (response.status === 401 || response.status === 403) { router.push('/login'); return; }
      const result = await response.json();
      if (result.success) setRequests(result.data);
      else setError(result.error || 'Gagal memuat data');
    } catch { setError('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleReset = async () => {
    if (!selectedUser) return;
    if (newPassword.length < 6) { toast.error('Password minimal 6 karakter'); return; }
    setProcessing(selectedUser.id);
    try {
      const response = await fetch('/api/accounts/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ userId: selectedUser.id, newPassword }) });
      const result = await response.json();
      if (result.success) { toast.success(`Password untuk ${selectedUser.karyawan?.nama || selectedUser.username} berhasil direset`); setShowResetModal(false); setNewPassword(''); setSelectedUser(null); fetchRequests(); }
      else toast.error(result.error || 'Gagal mereset password');
    } catch { toast.error('Terjadi kesalahan'); } finally { setProcessing(null); }
  };

  const handleReject = async (request: ResetRequest) => {
    if (!confirm(`Apakah Anda yakin ingin menolak permintaan reset password dari ${request.username}?`)) return;
    setProcessing(request.id);
    try {
      const response = await fetch('/api/accounts/reset-requests/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ userId: request.id }) });
      const result = await response.json();
      if (result.success) { toast.success(`Permintaan reset password dari ${request.karyawan?.nama || request.username} ditolak`); fetchRequests(); }
      else toast.error(result.error || 'Gagal menolak permintaan');
    } catch { toast.error('Terjadi kesalahan'); } finally { setProcessing(null); }
  };

  const formatDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading) return <LoadingSpinner text="Memuat permintaan reset..." />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reset Password Requests</h1>
          <p className="text-muted-foreground text-sm mt-1">Kelola permintaan reset password dari karyawan</p>
        </div>
        <Button variant="outline" onClick={fetchRequests} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" /> {error}
          </CardContent>
        </Card>
      )}

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
            <p className="text-lg font-medium">Tidak ada permintaan reset</p>
            <p className="text-sm">Semua akun dalam kondisi baik</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} className="border-amber-200">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-amber-700" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{request.karyawan?.nama || request.username}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Mail className="w-3.5 h-3.5" /> {request.username}
                        {request.karyawan?.nip && <><span className="mx-1">·</span>{request.karyawan.nip}</>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="w-3.5 h-3.5" /> {formatDate(request.requested_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => { setSelectedUser(request); setNewPassword(''); setShowResetModal(true); }} disabled={processing === request.id} className="bg-emerald-600 hover:bg-emerald-700">
                      {processing === request.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />} Reset
                    </Button>
                    <Button variant="destructive" onClick={() => handleReject(request)} disabled={processing === request.id}>
                      {processing === request.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />} Tolak
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reset Modal */}
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium">{selectedUser?.karyawan?.nama || selectedUser?.username}</p>
              <p className="text-muted-foreground">{selectedUser?.username}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Password Baru</Label>
              <Input id="newPassword" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimal 6 karakter" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowResetModal(false)}>Batal</Button>
            <Button onClick={handleReset} disabled={processing === selectedUser?.id} className="bg-emerald-600 hover:bg-emerald-700">
              {processing === selectedUser?.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />} Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
