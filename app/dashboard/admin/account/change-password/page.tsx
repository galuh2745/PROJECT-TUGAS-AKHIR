'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FadeIn } from '@/components/ui/page-transition';

function PasswordField({ label, id, value, onChange, show, toggleShow }: { label: string; id: string; value: string; onChange: (v: string) => void; show: boolean; toggleShow: () => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder="••••••••" className="pr-10" required />
        <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={toggleShow}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('Password baru minimal 6 karakter'); return; }
    if (newPassword !== confirmPassword) { toast.error('Konfirmasi password tidak cocok'); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/accounts/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ currentPassword, newPassword }) });
      if (response.status === 401) { router.push('/login'); return; }
      const result = await response.json();
      if (result.success) {
        toast.success('Password berhasil diubah');
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      } else toast.error(result.error || 'Gagal mengubah password');
    } catch { toast.error('Terjadi kesalahan'); } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto">
      <FadeIn>
        <Card>
          <CardHeader className="text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <CardTitle>Ubah Password</CardTitle>
            <CardDescription>Pastikan password baru Anda kuat dan mudah diingat</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordField label="Password Saat Ini" id="currentPassword" value={currentPassword} onChange={setCurrentPassword} show={showCurrent} toggleShow={() => setShowCurrent(!showCurrent)} />
              <PasswordField label="Password Baru" id="newPassword" value={newPassword} onChange={setNewPassword} show={showNew} toggleShow={() => setShowNew(!showNew)} />
              {newPassword && newPassword.length < 6 && <p className="text-xs text-red-500">Password minimal 6 karakter</p>}
              <PasswordField label="Konfirmasi Password Baru" id="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} toggleShow={() => setShowConfirm(!showConfirm)} />
              {confirmPassword && newPassword !== confirmPassword && <p className="text-xs text-red-500">Password tidak cocok</p>}
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md rounded-lg" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</> : 'Ubah Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
