'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User, Phone, MapPin, Clock, LogIn, LogOut, Briefcase, Camera, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  name: string;
  karyawan: {
    nama: string;
    nip: string;
    no_hp: string;
    alamat: string;
    foto_profil: string | null;
    jenis_karyawan: {
      nama_jenis: string;
      jam_masuk: string;
      jam_pulang: string;
    };
  } | null;
}

export default function AkunPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      if (data.success) setProfile(data.user);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Format file harus JPG, PNG, atau WebP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('foto', file);

      const res = await fetch('/api/auth/upload-foto', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Foto profil berhasil diupdate');
        fetchProfile();
      } else {
        toast.error(data.message || 'Gagal upload foto');
      }
    } catch {
      toast.error('Terjadi kesalahan saat upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (time: string) => time.substring(0, 5);

  if (loading) return <LoadingSpinner text="Memuat data..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Akun Saya</h1>
        <p className="text-muted-foreground text-sm mt-1">Informasi akun dan pengaturan</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <FadeIn className="lg:col-span-1">
          <Card>
            <CardContent className="pt-6 text-center">
              {/* Profile Photo */}
              <div className="relative inline-block">
                {profile?.karyawan?.foto_profil ? (
                  <div className="w-24 h-24 rounded-full overflow-hidden mx-auto ring-4 ring-background shadow-lg">
                    <Image
                      src={profile.karyawan.foto_profil}
                      alt="Foto Profil"
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-linear-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto ring-4 ring-background shadow-lg">
                    <span className="text-primary font-bold text-3xl">
                      {profile?.karyawan?.nama?.charAt(0).toUpperCase() || profile?.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
                {/* Upload Button Overlay */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-colors duration-200 disabled:opacity-50 ring-2 ring-white"
                  title="Ganti foto profil"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleUploadFoto}
                />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {profile?.karyawan?.nama || profile?.name}
              </h3>
              <p className="text-sm text-muted-foreground">{profile?.karyawan?.nip || '-'}</p>
              <span className="inline-flex items-center mt-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                <Briefcase className="w-3 h-3 mr-1" />
                {profile?.karyawan?.jenis_karyawan?.nama_jenis || 'Karyawan'}
              </span>

              {/* Upload hint */}
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs"
                >
                  {uploading ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Mengupload...</>
                  ) : (
                    <><Camera className="w-3 h-3 mr-1.5" /> Upload Foto Profil</>
                  )}
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1.5">JPG, PNG, WebP. Maks 5MB</p>
              </div>

              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground">Untuk mengubah password, silakan hubungi Admin.</p>
              </div>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Info Details */}
        <div className="lg:col-span-2 space-y-6">
          <FadeIn delay={0.1}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> Informasi Akun</CardTitle>
              </CardHeader>
              <CardContent>
                <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: User, label: 'Nama Lengkap', value: profile?.karyawan?.nama || profile?.name },
                    { icon: Briefcase, label: 'NIP', value: profile?.karyawan?.nip || '-' },
                    { icon: Phone, label: 'No. HP', value: profile?.karyawan?.no_hp || '-' },
                  ].map(item => (
                    <StaggerItem key={item.label}>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-1">
                          <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</span>
                        </div>
                        <p className="text-foreground font-medium">{item.value}</p>
                      </div>
                    </StaggerItem>
                  ))}
                  <StaggerItem className="sm:col-span-2">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alamat</span>
                      </div>
                      <p className="text-foreground font-medium">{profile?.karyawan?.alamat || '-'}</p>
                    </div>
                  </StaggerItem>
                </StaggerContainer>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Jadwal Kerja */}
          {profile?.karyawan?.jenis_karyawan && (
            <FadeIn delay={0.2}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Jadwal Kerja</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg dark:bg-emerald-950/20">
                      <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                        <LogIn className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-emerald-600 font-medium">Jam Masuk</p>
                        <p className="text-lg font-bold text-emerald-700">{formatTime(profile.karyawan.jenis_karyawan.jam_masuk)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg dark:bg-blue-950/20">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                        <LogOut className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-blue-600 font-medium">Jam Pulang</p>
                        <p className="text-lg font-bold text-blue-700">{formatTime(profile.karyawan.jenis_karyawan.jam_pulang)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </FadeIn>
          )}
        </div>
      </div>
    </div>
  );
}
