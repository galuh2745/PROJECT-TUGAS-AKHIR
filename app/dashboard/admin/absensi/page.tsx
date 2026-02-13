'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import {
  Download, Calendar, AlertCircle, ChevronRight, Camera, RotateCcw, Loader2, ClipboardList, Users, CheckCircle2, Clock, FileWarning, XCircle, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaggerContainer, StaggerItem } from '@/components/ui/page-transition';
import { MapPin } from 'lucide-react';

interface JenisKaryawan { id: string; nama: string; }
interface DetailAbsensi { id: string; tanggal: string; jam_masuk: string; jam_pulang: string; status: string; foto_masuk: string | null; foto_pulang: string | null; latitude: number | null; longitude: number | null; }
interface RekapKaryawan { karyawan_id: string; nip: string; nama: string; jenis_karyawan: JenisKaryawan; rekap: { hadir: number; terlambat: number; izin: number; cuti: number; alpha: number; total_masuk: number; }; detail: DetailAbsensi[]; }
interface Summary { total_karyawan: number; total_hadir: number; total_terlambat: number; total_izin: number; total_cuti: number; total_alpha: number; }
interface Periode { bulan: number; tahun: number; tanggal_awal: string; tanggal_akhir: string; }
interface RekapResponse { success: boolean; data?: { periode: Periode; summary: Summary; rekap: RekapKaryawan[]; }; error?: string; }
interface KaryawanOption { id: string; nip: string; nama: string; }
interface JenisKaryawanOption { id: string; nama_jenis: string; }

const getBulanNama = (b: number) => ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][b - 1] || '';

const statusVariant = (status: string) => {
  const m: Record<string, string> = {
    HADIR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    TERLAMBAT: 'bg-amber-50 text-amber-700 border-amber-200',
    IZIN: 'bg-blue-50 text-blue-700 border-blue-200',
    CUTI: 'bg-purple-50 text-purple-700 border-purple-200',
    ALPHA: 'bg-red-50 text-red-700 border-red-200',
  };
  return m[status] || 'bg-gray-50 text-gray-700 border-gray-200';
};

const formatTanggal = (s: string) => new Date(s).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default function RiwayatAbsensiPage() {
  const router = useRouter();
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [selectedKaryawan, setSelectedKaryawan] = useState('');
  const [selectedJenisKaryawan, setSelectedJenisKaryawan] = useState('');
  const [loading, setLoading] = useState(true);
  const [rekapData, setRekapData] = useState<RekapKaryawan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [periode, setPeriode] = useState<Periode | null>(null);
  const [expandedKaryawan, setExpandedKaryawan] = useState<string | null>(null);
  const [karyawanOptions, setKaryawanOptions] = useState<KaryawanOption[]>([]);
  const [jenisKaryawanOptions, setJenisKaryawanOptions] = useState<JenisKaryawanOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; tanggal: string } | null>(null);

  const fetchOptions = async () => {
    try {
      const [kRes, jRes] = await Promise.all([
        fetch('/api/karyawan', { credentials: 'include' }),
        fetch('/api/jenis-karyawan', { credentials: 'include' }),
      ]);
      if (kRes.ok) { const d = await kRes.json(); if (d.success) setKaryawanOptions(d.data.map((k: any) => ({ id: k.id, nip: k.nip, nama: k.nama }))); }
      if (jRes.ok) { const d = await jRes.json(); if (d.success) setJenisKaryawanOptions(d.data); }
    } catch {}
  };

  const fetchRekapAbsensi = async () => {
    try {
      setLoading(true); setError(null);
      const params = new URLSearchParams({ bulan: bulan.toString(), tahun: tahun.toString() });
      if (selectedKaryawan) params.append('karyawan_id', selectedKaryawan);
      if (selectedJenisKaryawan) params.append('jenis_karyawan_id', selectedJenisKaryawan);
      const response = await fetch(`/api/absensi/rekap-bulanan?${params.toString()}`, { credentials: 'include' });
      if (response.status === 401 || response.status === 403) { router.push('/login'); return; }
      const result: RekapResponse = await response.json();
      if (result.success && result.data) { setRekapData(result.data.rekap); setSummary(result.data.summary); setPeriode(result.data.periode); }
      else setError(result.error || 'Gagal memuat data rekap absensi');
    } catch { setError('Terjadi kesalahan saat memuat data'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchOptions(); }, []);
  useEffect(() => { fetchRekapAbsensi(); }, [bulan, tahun, selectedKaryawan, selectedJenisKaryawan]);

  const handleReset = () => { setBulan(new Date().getMonth() + 1); setTahun(new Date().getFullYear()); setSelectedKaryawan(''); setSelectedJenisKaryawan(''); setExpandedKaryawan(null); };

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams({ bulan: bulan.toString(), tahun: tahun.toString() });
      if (selectedKaryawan) params.append('karyawan_id', selectedKaryawan);
      if (selectedJenisKaryawan) params.append('jenis_karyawan_id', selectedJenisKaryawan);
      const response = await fetch(`/api/absensi/rekap-bulanan/pdf?${params.toString()}`, { credentials: 'include' });
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        if (contentType?.includes('application/json')) { const e = await response.json(); throw new Error(e.error || 'Gagal mengexport PDF'); }
        throw new Error(`Gagal mengexport PDF (Status: ${response.status})`);
      }
      if (!contentType?.includes('application/pdf')) throw new Error('Response bukan file PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Rekap_Absensi_${getBulanNama(bulan)}_${tahun}.pdf`;
      document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
      toast.success('PDF berhasil diunduh');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengexport PDF';
      toast.error(msg);
    } finally { setExporting(false); }
  };

  const tahunOptions = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= currentYear - 5; y--) tahunOptions.push(y);

  const summaryCards = summary ? [
    { label: 'Total Karyawan', value: summary.total_karyawan, icon: Users, color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Total Hadir', value: summary.total_hadir, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Total Terlambat', value: summary.total_terlambat, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Total Izin', value: summary.total_izin, icon: FileWarning, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Total Cuti', value: summary.total_cuti, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Total Alpha', value: summary.total_alpha, icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Riwayat Absensi Bulanan</h1>
          <p className="text-muted-foreground text-sm mt-1">Rekap absensi karyawan per bulan</p>
        </div>
        <Button onClick={handleExportPDF} disabled={exporting || loading || rekapData.length === 0} variant="destructive">
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          {exporting ? 'Mengexport...' : 'Export PDF'}
        </Button>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Bulan</Label>
              <select value={bulan} onChange={(e) => setBulan(parseInt(e.target.value))} className={selectClass}>
                {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{getBulanNama(i+1)}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Tahun</Label>
              <select value={tahun} onChange={(e) => setTahun(parseInt(e.target.value))} className={selectClass}>
                {tahunOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Jenis Karyawan</Label>
              <select value={selectedJenisKaryawan} onChange={(e) => setSelectedJenisKaryawan(e.target.value)} className={selectClass}>
                <option value="">Semua Jenis</option>
                {jenisKaryawanOptions.map(j => <option key={j.id} value={j.id}>{j.nama_jenis}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Karyawan</Label>
              <select value={selectedKaryawan} onChange={(e) => setSelectedKaryawan(e.target.value)} className={selectClass}>
                <option value="">Semua Karyawan</option>
                {karyawanOptions.map(k => <option key={k.id} value={k.id}>{k.nama} ({k.nip})</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={handleReset}><RotateCcw className="w-4 h-4 mr-2" />Reset</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {summaryCards.map((item) => (
            <StaggerItem key={item.label}>
              <Card>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <div className={`w-10 h-10 ${item.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-xl font-bold">{item.value}</p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Periode Info */}
      {periode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          <span className="text-blue-800 font-medium">Periode: {getBulanNama(periode.bulan)} {periode.tahun}</span>
          <span className="text-blue-600 text-sm">({periode.tanggal_awal} s/d {periode.tanggal_akhir})</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" /><span>{error}</span>
        </div>
      )}

      {loading ? <LoadingSpinner text="Memuat data rekap absensi..." /> : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">NIP</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nama</th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Jenis</th>
                    <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase"><span className="hidden sm:inline">Hadir</span><span className="sm:hidden">H</span></th>
                    <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Terlambat</th>
                    <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Izin</th>
                    <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Cuti</th>
                    <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase"><span className="hidden sm:inline">Alpha</span><span className="sm:hidden">A</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rekapData.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                      <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p>Tidak ada data absensi untuk periode ini</p>
                    </td></tr>
                  ) : rekapData.map((item) => (
                    <React.Fragment key={item.karyawan_id}>
                      <tr onClick={() => setExpandedKaryawan(expandedKaryawan === item.karyawan_id ? null : item.karyawan_id)} className="hover:bg-muted/50 cursor-pointer transition">
                        <td className="px-3 sm:px-6 py-3">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedKaryawan === item.karyawan_id ? 'rotate-90' : ''}`} />
                            <span className="text-sm font-mono">{item.nip}</span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-3">
                          <span className="text-sm font-medium">{item.nama}</span>
                          <span className="block text-xs text-muted-foreground md:hidden">{item.jenis_karyawan.nama}</span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 hidden md:table-cell"><span className="px-2 py-0.5 text-xs font-medium bg-muted rounded-full">{item.jenis_karyawan.nama}</span></td>
                        <td className="px-3 sm:px-6 py-3 text-center"><span className="inline-flex items-center justify-center w-8 h-8 text-sm font-semibold text-emerald-700 bg-emerald-100 rounded-full">{item.rekap.hadir}</span></td>
                        <td className="px-3 sm:px-6 py-3 text-center hidden sm:table-cell"><span className="inline-flex items-center justify-center w-8 h-8 text-sm font-semibold text-amber-700 bg-amber-100 rounded-full">{item.rekap.terlambat}</span></td>
                        <td className="px-3 sm:px-6 py-3 text-center hidden md:table-cell"><span className="inline-flex items-center justify-center w-8 h-8 text-sm font-semibold text-blue-700 bg-blue-100 rounded-full">{item.rekap.izin}</span></td>
                        <td className="px-3 sm:px-6 py-3 text-center hidden lg:table-cell"><span className="inline-flex items-center justify-center w-8 h-8 text-sm font-semibold text-purple-700 bg-purple-100 rounded-full">{item.rekap.cuti}</span></td>
                        <td className="px-3 sm:px-6 py-3 text-center"><span className="inline-flex items-center justify-center w-8 h-8 text-sm font-semibold text-red-700 bg-red-100 rounded-full">{item.rekap.alpha}</span></td>
                      </tr>
                      {expandedKaryawan === item.karyawan_id && (
                        <tr><td colSpan={8} className="px-3 sm:px-6 py-4 bg-muted/30">
                          <div className="sm:ml-6">
                            <h4 className="text-sm font-semibold text-foreground mb-3">Detail Absensi - {item.nama}</h4>
                            {item.detail.length === 0 ? <p className="text-sm text-muted-foreground italic">Tidak ada data absensi</p> : (
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-border border rounded-lg">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Tanggal</th>
                                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Masuk</th>
                                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Pulang</th>
                                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Status</th>
                                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Foto</th>
                                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Lokasi</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border bg-background">
                                    {item.detail.map(d => (
                                      <tr key={d.id} className="hover:bg-muted/50">
                                        <td className="px-4 py-2 text-sm">{formatTanggal(d.tanggal)}</td>
                                        <td className="px-4 py-2 text-sm text-muted-foreground text-center">{d.jam_masuk}</td>
                                        <td className="px-4 py-2 text-sm text-muted-foreground text-center hidden sm:table-cell">{d.jam_pulang}</td>
                                        <td className="px-4 py-2 text-center">
                                          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${statusVariant(d.status)}`}>{d.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-center hidden md:table-cell">
                                          <div className="flex items-center justify-center gap-2">
                                            {d.foto_masuk ? <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-700" onClick={(e) => { e.stopPropagation(); setSelectedPhoto(d.foto_masuk); }}><Camera className="w-3 h-3 mr-1" />Masuk</Button> : <span className="text-xs text-muted-foreground">-</span>}
                                            {d.foto_pulang && <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-700" onClick={(e) => { e.stopPropagation(); setSelectedPhoto(d.foto_pulang); }}><Camera className="w-3 h-3 mr-1" />Pulang</Button>}
                                          </div>
                                        </td>
                                        <td className="px-4 py-2 text-center hidden md:table-cell">
                                          {d.latitude != null && d.longitude != null ? (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setSelectedLocation({ lat: d.latitude!, lng: d.longitude!, tanggal: d.tanggal }); }}
                                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition"
                                            >
                                              <MapPin className="w-3 h-3" />
                                              Lihat Peta
                                            </button>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">Klik pada baris karyawan untuk melihat detail absensi harian</p>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-w-4xl max-h-[90vh] bg-background rounded-lg overflow-hidden shadow-2xl">
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full" onClick={() => setSelectedPhoto(null)}>
              <X className="w-5 h-5" />
            </Button>
            <img src={selectedPhoto} alt="Foto Absensi" className="max-w-full max-h-[85vh] object-contain" onClick={(e) => e.stopPropagation()} />
            <div className="p-4 border-t"><p className="text-sm text-muted-foreground text-center">Foto absensi dengan watermark (nama, waktu, lokasi)</p></div>
          </div>
        </div>
      )}

      {/* Map Modal */}
      {selectedLocation && (
        <LocationMapModal
          lat={selectedLocation.lat}
          lng={selectedLocation.lng}
          tanggal={selectedLocation.tanggal}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  );
}

// Komponen modal peta lokasi absensi
function LocationMapModal({ lat, lng, tanggal, onClose }: { lat: number; lng: number; tanggal: string; onClose: () => void }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [address, setAddress] = useState<string>('');
  const [mapReady, setMapReady] = useState(false);

  // Reverse geocode
  useEffect(() => {
    fetch(`/api/absensi/geocode?lat=${lat}&lon=${lng}`)
      .then(r => r.json())
      .then(d => { if (d.success && d.address) setAddress(d.address); })
      .catch(() => {});
  }, [lat, lng]);

  // Init MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !mapContainerRef.current) return;

      const map = new maplibregl.default.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: [
                'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              ],
              tileSize: 256,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [lng, lat],
        zoom: 17,
      });

      map.addControl(new maplibregl.default.NavigationControl(), 'top-right');

      // Marker element
      const markerEl = document.createElement('div');
      markerEl.innerHTML = `
        <div style="position:relative;width:40px;height:52px;">
          <svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 0C8.954 0 0 8.954 0 20c0 14 20 32 20 32s20-18 20-32C40 8.954 31.046 0 20 0z" fill="#ef4444"/>
            <circle cx="20" cy="18" r="8" fill="white"/>
            <circle cx="20" cy="18" r="4" fill="#ef4444"/>
          </svg>
          <div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:14px;height:5px;background:rgba(0,0,0,0.2);border-radius:50%;"></div>
        </div>
      `;

      new maplibregl.default.Marker({ element: markerEl, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl bg-background rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-sm font-semibold">Lokasi Absensi</h3>
              <p className="text-xs text-muted-foreground">{new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Map */}
        <div ref={mapContainerRef} style={{ height: '400px', width: '100%' }} />

        {/* Address & Coordinates */}
        <div className="p-4 border-t space-y-2">
          {address && (
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-600 leading-snug">{address}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Koordinat: {lat.toFixed(6)}, {lng.toFixed(6)}</p>
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              Buka di Google Maps
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
