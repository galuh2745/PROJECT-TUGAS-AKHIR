'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  LogIn, LogOut, CheckCircle2, CalendarCheck, AlertTriangle,
  Loader2, RefreshCw, X, MapPin
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/page-transition';

const Camera = dynamic(() => import('@/components/Camera'), { ssr: false });
const AbsensiMap = dynamic(() => import('@/components/AbsensiMap'), { ssr: false });

interface Karyawan {
  id: string;
  nama: string;
  nip: string;
  jenis_karyawan: string;
  jam_masuk_normal: string;
  jam_pulang_normal: string;
  is_shift_malam: boolean;
  skip_jam_kerja: boolean;
}

interface AbsensiHariIni {
  id: string;
  tanggal: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  status: string;
}

interface Ringkasan {
  absensi_hari_ini: AbsensiHariIni | null;
  total_kehadiran_bulan_ini: number;
  total_jam_lembur_bulan_ini: number;
}

interface RiwayatAbsensi {
  id: string;
  tanggal: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  status: string;
}

interface RiwayatIzinCuti {
  id: string;
  jenis: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  alasan: string;
  status: string;
  created_at: string;
}

interface RiwayatLembur {
  id: string;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  total_jam: number;
  keterangan: string;
}

interface DashboardData {
  karyawan: Karyawan;
  ringkasan: Ringkasan;
  riwayat: {
    absensi: RiwayatAbsensi[];
    izin_cuti: RiwayatIzinCuti[];
    lembur: RiwayatLembur[];
  };
}

const statusVariant = (status: string) => {
  const map: Record<string, string> = {
    HADIR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    TERLAMBAT: 'bg-amber-50 text-amber-700 border-amber-200',
    IZIN: 'bg-blue-50 text-blue-700 border-blue-200',
    CUTI: 'bg-purple-50 text-purple-700 border-purple-200',
    SAKIT: 'bg-orange-50 text-orange-700 border-orange-200',
    ALPHA: 'bg-red-50 text-red-700 border-red-200',
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
  };
  return map[status] || 'bg-gray-50 text-gray-700 border-gray-200';
};

export default function UserDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);

  const handleAbsenMasuk = () => setShowCamera(true);

  const handleCapturePhoto = async (photo: Blob, latitude: number, longitude: number) => {
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', photo, 'absensi.jpg');
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());

      const response = await fetch('/api/absensi/masuk', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const result = await response.json();

      if (result.success) {
        toast.success(result.message || 'Berhasil absen masuk!');
        setShowCamera(false);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error(result.error || 'Gagal absen masuk');
        setShowCamera(false);
      }
    } catch {
      toast.error('Gagal mengirim absensi');
      setShowCamera(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAbsenPulang = async () => {
    setActionLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const response = await fetch('/api/absensi/pulang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });
      const result = await response.json();

      if (result.success) {
        toast.success('Berhasil absen pulang!');
        window.location.reload();
      } else {
        toast.error(result.error || 'Gagal absen pulang');
      }
    } catch (err: any) {
      toast.error(err.code === 1 ? 'Izinkan akses lokasi untuk absen' : 'Gagal mendapatkan lokasi');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/dashboard/user', { credentials: 'include' });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) { router.push('/login'); return; }
          throw new Error('Failed');
        }
        const result = await response.json();
        if (result.success) setData(result.data);
        else setError(result.error);
      } catch {
        setError('Gagal memuat data dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router]);

  const formatTime = (time: string | null) => {
    if (!time) return '-';
    return new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  if (loading) return <LoadingSpinner text="Memuat data..." />;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-destructive">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" /> Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  const absensi = data?.ringkasan.absensi_hari_ini;
  const sudahMasuk = !!absensi?.jam_masuk || (data?.karyawan.skip_jam_kerja && !!absensi);
  const sudahPulang = !!absensi?.jam_pulang;
  const isSkipJamKerja = data?.karyawan.skip_jam_kerja || false;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Absensi</h1>
          <p className="text-muted-foreground text-sm mt-1">Absen masuk dan pulang hari ini</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Aksi Cepat */}
      <FadeIn>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aksi Cepat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid grid-cols-1 ${isSkipJamKerja ? '' : 'sm:grid-cols-2'} gap-4`}>
              <button
                onClick={handleAbsenMasuk}
                disabled={actionLoading || sudahMasuk}
                className="flex flex-col items-center justify-center p-6 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center mb-3">
                  <LogIn className="w-7 h-7 text-white" />
                </div>
                <span className="text-base font-semibold text-emerald-700">
                  {isSkipJamKerja ? 'Absen Kehadiran' : 'Absen Masuk'}
                </span>
                {sudahMasuk ? (
                  <span className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Sudah absen
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground mt-1">
                    {isSkipJamKerja ? 'Foto & lokasi saja' : 'Klik untuk absen masuk'}
                  </span>
                )}
              </button>

              {!isSkipJamKerja && (
              <button
                onClick={handleAbsenPulang}
                disabled={actionLoading || !sudahMasuk || sudahPulang}
                className="flex flex-col items-center justify-center p-6 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center mb-3">
                  <LogOut className="w-7 h-7 text-white" />
                </div>
                <span className="text-base font-semibold text-blue-700">Absen Pulang</span>
                {sudahPulang ? (
                  <span className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Sudah absen
                  </span>
                ) : !sudahMasuk ? (
                  <span className="text-xs text-muted-foreground mt-1">Absen masuk dulu</span>
                ) : (
                  <span className="text-xs text-muted-foreground mt-1">Klik untuk absen pulang</span>
                )}
              </button>
              )}
            </div>

            {actionLoading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Memproses...</span>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Lokasi Saat Ini (Map) */}
      <FadeIn>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" />
              Lokasi Anda Saat Ini
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AbsensiMap
              height="250px"
              onLocationChange={(loc) => {
                setUserLocation({ lat: loc.latitude, lng: loc.longitude });
                setUserAddress(loc.address);
              }}
            />
          </CardContent>
        </Card>
      </FadeIn>

      {/* Ringkasan Cards */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StaggerItem>
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Status Hari Ini</h3>
              {absensi ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusVariant(absensi.status)}`}>
                      {absensi.status}
                    </span>
                  </div>
                  {!isSkipJamKerja && (
                  <div className="space-y-1 mt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Masuk:</span>
                      <span className="font-medium">{formatTime(absensi.jam_masuk)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pulang:</span>
                      <span className="font-medium">{formatTime(absensi.jam_pulang)}</span>
                    </div>
                  </div>
                  )}
                  {isSkipJamKerja && (
                  <div className="mt-3 text-sm text-muted-foreground text-center">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    Absen dengan foto & lokasi
                  </div>
                  )}
                </div>
              ) : (
                <p className="text-center py-4 text-muted-foreground">Belum absen hari ini</p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="flex items-center gap-4 pt-5">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CalendarCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Kehadiran Bulan Ini</p>
                <p className="text-2xl font-bold">{data?.ringkasan.total_kehadiran_bulan_ini}</p>
                <p className="text-xs text-muted-foreground mt-1">Hari hadir</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Tabs Riwayat */}
      <FadeIn>
        <Card>
          <Tabs defaultValue="absensi">
            <CardHeader className="pb-0">
              <TabsList>
                <TabsTrigger value="absensi">Riwayat Absensi</TabsTrigger>
                <TabsTrigger value="izin">Riwayat Izin & Cuti</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Tab Absensi */}
              <TabsContent value="absensi" className="m-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      {!isSkipJamKerja && <TableHead>Jam Masuk</TableHead>}
                      {!isSkipJamKerja && <TableHead>Jam Pulang</TableHead>}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.riwayat.absensi.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isSkipJamKerja ? 2 : 4} className="text-center py-8 text-muted-foreground">Belum ada data absensi</TableCell>
                      </TableRow>
                    ) : (
                      data?.riwayat.absensi.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{formatDate(item.tanggal)}</TableCell>
                          {!isSkipJamKerja && <TableCell className="text-muted-foreground">{formatTime(item.jam_masuk)}</TableCell>}
                          {!isSkipJamKerja && <TableCell className="text-muted-foreground">{formatTime(item.jam_pulang)}</TableCell>}
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusVariant(item.status)}`}>
                              {item.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              {/* Tab Izin & Cuti */}
              <TabsContent value="izin" className="m-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Tanggal Mulai</TableHead>
                      <TableHead>Tanggal Selesai</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.riwayat.izin_cuti.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada pengajuan izin/cuti</TableCell>
                      </TableRow>
                    ) : (
                      data?.riwayat.izin_cuti.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.jenis}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(item.tanggal_mulai)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(item.tanggal_selesai)}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">{item.alasan}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusVariant(item.status)}`}>
                              {item.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>


            </CardContent>
          </Tabs>
        </Card>
      </FadeIn>

      {/* Camera Modal */}
      {showCamera && (
        <Camera
          onCapture={handleCapturePhoto}
          onCancel={() => setShowCamera(false)}
          isSubmitting={actionLoading}
        />
      )}
    </div>
  );
}
