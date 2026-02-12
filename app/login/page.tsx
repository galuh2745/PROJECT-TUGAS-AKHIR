'use client';

import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { User, Lock, ArrowRight, Loader2, Info, KeyRound, X, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  const [nip, setNip] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotNip, setForgotNip] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip, password }),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Login berhasil! Mengalihkan...');
        if (redirect) {
          window.location.href = redirect;
        } else {
          const role = data.data.user.role;
          if (role === 'ADMIN' || role === 'OWNER') {
            window.location.href = '/dashboard/admin';
          } else {
            window.location.href = '/dashboard/user';
          }
        }
      } else {
        setError(data.message || 'NIP atau password salah');
        toast.error(data.message || 'NIP atau password salah');
      }
    } catch (err) {
      setError('Terjadi kesalahan koneksi. Silakan coba lagi.');
      toast.error('Gagal terhubung ke server');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotNip) {
      toast.error('NIP harus diisi');
      return;
    }

    setForgotLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: forgotNip }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Permintaan reset password berhasil dikirim ke admin!');
        setTimeout(() => {
          setShowForgotModal(false);
          setForgotNip('');
        }, 1500);
      } else {
        toast.error(data.error || 'Gagal mengirim permintaan');
      }
    } catch (err) {
      toast.error('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden">
      {/* ===== BACKGROUND ===== */}
      <div className="absolute inset-0 z-0">
        {/* Background image */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/images/logo/logocv.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(6px) brightness(0.4)',
            transform: 'scale(1.1)',
          }}
        />
        {/* Blue gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.85) 0%, rgba(37, 99, 235, 0.7) 40%, rgba(29, 78, 216, 0.8) 70%, rgba(15, 23, 42, 0.9) 100%)',
          }}
        />
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* ===== FLOATING DECORATIVE ELEMENTS ===== */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.4) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -left-32 w-125 h-125 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(147,197,253,0.3) 0%, transparent 70%)' }} />
        <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, rgba(253,224,71,0.5) 0%, transparent 70%)' }} />
      </div>

      {/* ===== MAIN LOGIN CARD ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={mounted ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-110 mx-4"
      >
        <div
          className="rounded-3xl px-8 py-6 md:px-10 md:py-8 shadow-2xl border border-white/20"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* ===== LOGO AVATAR ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={mounted ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
            className="flex flex-col items-center mb-4"
          >
            <div
              className="relative w-20 h-20 rounded-full overflow-hidden border-[3px] mb-3"
              style={{
                borderColor: '#2563eb',
                boxShadow: '0 8px 32px rgba(37, 99, 235, 0.25), 0 0 0 4px rgba(37, 99, 235, 0.1)',
              }}
            >
              <Image
                src="/images/logo/logocvaswihd.png"
                alt="Logo CV Aswi Sentosa"
                fill
                className="object-cover"
                priority
              />
            </div>
            <h1 className="text-lg font-bold text-gray-800 tracking-tight">
              CV Aswi Sentosa Lampung
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Sistem Absensi & Inventory
            </p>
          </motion.div>

          {/* ===== DIVIDER ===== */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Masuk ke Akun</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* ===== FORM LOGIN ===== */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nip" className="text-sm font-semibold text-gray-700">
                NIP
              </Label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 transition-colors duration-200 group-focus-within:text-blue-600" />
                <Input
                  id="nip"
                  type="text"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  className="pl-11 h-11 rounded-xl border-gray-200 bg-gray-50/80 text-gray-800 placeholder:text-gray-400 transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white hover:border-gray-300"
                  placeholder="Masukkan NIP"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                Password
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 transition-colors duration-200 group-focus-within:text-blue-600" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 pr-11 h-11 rounded-xl border-gray-200 bg-gray-50/80 text-gray-800 placeholder:text-gray-400 transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white hover:border-gray-300"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3.5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.06)',
                  borderColor: 'rgba(239, 68, 68, 0.15)',
                }}
              >
                <Info className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-red-600 text-sm">{error}</span>
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-sm font-semibold rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100"
              style={{
                backgroundColor: '#2563eb',
                color: 'white',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Memproses...
                </>
              ) : (
                <>
                  Masuk
                  <ArrowRight className="h-5 w-5 ml-2" />
                </>
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-sm font-medium transition-all duration-200 hover:underline underline-offset-4"
                style={{ color: '#2563eb' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#1d4ed8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#2563eb'; }}
              >
                Lupa Password?
              </button>
            </div>
          </form>

          {/* ===== INFO SECTION ===== */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-blue-50/70 border border-blue-100">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-gray-500 text-xs leading-snug">
                <span className="font-semibold text-gray-600">Butuh bantuan?</span> Hubungi admin untuk masalah login.
              </p>
            </div>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={mounted ? { opacity: 1 } : {}}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="text-center text-white/60 text-xs mt-4"
        >
          © 2026 CV Aswi Sentosa Lampung. All rights reserved.
        </motion.p>
      </motion.div>

      {/* ===== FORGOT PASSWORD MODAL ===== */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowForgotModal(false); setForgotNip(''); }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-md"
          >
            <div
              className="rounded-2xl overflow-hidden shadow-2xl border border-white/20"
              style={{
                background: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Modal Header with Blue Gradient */}
              <div
                className="px-6 py-5"
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
                      <KeyRound className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Lupa Password</h3>
                      <p className="text-blue-100 text-sm mt-0.5">Reset melalui admin</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowForgotModal(false); setForgotNip(''); }}
                    className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-6 space-y-5">
                <p className="text-gray-500 text-sm leading-relaxed">
                  Masukkan NIP untuk mengirim permintaan reset password ke admin.
                </p>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-gray-700">NIP</Label>
                  <div className="relative group">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 transition-colors duration-200 group-focus-within:text-blue-600" />
                    <Input
                      type="text"
                      value={forgotNip}
                      onChange={(e) => setForgotNip(e.target.value)}
                      placeholder="Masukkan NIP"
                      className="pl-11 h-12 rounded-xl border-gray-200 bg-gray-50/80 text-gray-800 placeholder:text-gray-400 transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white hover:border-gray-300"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button
                    onClick={handleForgotPassword}
                    disabled={forgotLoading}
                    className="flex-1 h-11 font-semibold rounded-xl shadow-md transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100"
                    style={{ backgroundColor: '#2563eb', color: 'white' }}
                    onMouseEnter={(e) => { if (!forgotLoading) e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Mengirim...
                      </>
                    ) : (
                      'Kirim Permintaan'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setShowForgotModal(false); setForgotNip(''); }}
                    className="flex-1 h-11 font-semibold rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-700 transition-all duration-200"
                  >
                    Batal
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
