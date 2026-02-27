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
        {/* Deep gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(160deg, #0a1628 0%, #0f2847 25%, #132e52 45%, #1a3a6b 65%, #1e3a8a 85%, #1e40af 100%)',
          }}
        />
        {/* Animated mesh gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 20% 80%, rgba(59,130,246,0.1) 0%, transparent 50%), radial-gradient(ellipse 50% 50% at 80% 20%, rgba(96,165,250,0.08) 0%, transparent 50%)',
          }}
        />
        {/* Subtle dot pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />
        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundSize: '128px 128px',
          }}
        />
      </div>

      {/* ===== RADIAL GLOW BEHIND CARD ===== */}
      <div className="absolute inset-0 z-[1] flex items-center justify-center pointer-events-none">
        <div
          className="w-[600px] h-[600px] md:w-[700px] md:h-[700px]"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(37,99,235,0.08) 35%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
      </div>

      {/* ===== FLOATING DECORATIVE ELEMENTS ===== */}
      <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.6) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, rgba(147,197,253,0.5) 0%, transparent 70%)' }} />
        <div className="absolute top-[15%] right-[10%] w-80 h-80 rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, rgba(219,234,254,0.6) 0%, transparent 60%)' }} />
        {/* Subtle horizontal light streak */}
        <div className="absolute top-1/2 left-0 w-full h-px opacity-[0.06]"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(147,197,253,0.5) 30%, rgba(96,165,250,0.5) 50%, rgba(147,197,253,0.5) 70%, transparent 100%)' }} />
      </div>

      {/* ===== WATERMARK LOGO ===== */}
      <div className="absolute inset-0 z-[1] flex items-center justify-center pointer-events-none">
        <div className="relative w-[500px] h-[500px] opacity-[0.03]">
          <Image
            src="/images/logo/logocvaswihd.png"
            alt=""
            fill
            className="object-contain"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* ===== MAIN LOGIN CARD ===== */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={mounted ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[430px] mx-4"
      >
        <div
          className="relative rounded-3xl px-8 py-8 md:px-11 md:py-10 border border-white/[0.18] overflow-hidden"
          style={{
            background: 'rgba(255, 255, 255, 0.82)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 8px 24px -8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
          }}
        >
          {/* Card top edge highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 20%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.6) 80%, transparent 100%)' }} />

          {/* ===== LOGO AVATAR ===== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={mounted ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center mb-6"
          >
            <div
              className="relative w-[88px] h-[88px] overflow-hidden mb-4"
            >
              <Image
                src="/images/logo/logocvaswihd.png"
                alt="Logo CV Aswi Sentosa"
                fill
                className="object-cover"
                priority
              />
            </div>
            <h1 className="text-xl font-extrabold text-gray-800 tracking-tight">
              CV Aswi Sentosa Lampung
            </h1>
            <p className="text-xs text-gray-500 mt-1 font-medium tracking-wide">
              Sistem Absensi & Inventory
            </p>
            {/* Gradient accent line under title */}
            <div className="mt-3 w-16 h-[3px] rounded-full"
              style={{ background: 'linear-gradient(90deg, #3b82f6, #2563eb, #1d4ed8)' }} />
          </motion.div>

          {/* ===== DIVIDER ===== */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.15em]">Masuk ke Akun</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
          </div>

          {/* ===== FORM LOGIN ===== */}
          <form onSubmit={handleLogin} className="space-y-4">
            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={mounted ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3, duration: 0.4, ease: 'easeOut' }}
              className="space-y-1.5"
            >
              <Label htmlFor="nip" className="text-sm font-semibold text-gray-700">
                NIP
              </Label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 transition-all duration-300 group-focus-within:text-blue-600 group-focus-within:scale-110" />
                <Input
                  id="nip"
                  type="text"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  className="pl-11 h-12 rounded-xl border-gray-200/80 bg-white/60 text-gray-800 placeholder:text-gray-400 transition-all duration-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:shadow-lg focus:shadow-blue-500/5 hover:border-gray-300 hover:bg-white/80"
                  placeholder="Masukkan NIP"
                  required
                  autoComplete="username"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={mounted ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.4, duration: 0.4, ease: 'easeOut' }}
              className="space-y-1.5"
            >
              <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                Password
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 transition-all duration-300 group-focus-within:text-blue-600 group-focus-within:scale-110" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 pr-11 h-12 rounded-xl border-gray-200/80 bg-white/60 text-gray-800 placeholder:text-gray-400 transition-all duration-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:shadow-lg focus:shadow-blue-500/5 hover:border-gray-300 hover:bg-white/80"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-all duration-300 hover:scale-110"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-red-200/60 bg-red-50/50 backdrop-blur-sm"
              >
                <Info className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-red-600 text-sm font-medium">{error}</span>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={mounted ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5, duration: 0.4, ease: 'easeOut' }}
            >
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-sm font-bold rounded-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-blue-600/25 active:scale-[0.97] disabled:opacity-70 disabled:hover:scale-100 disabled:hover:shadow-none cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
                  color: 'white',
                  boxShadow: '0 8px 24px -4px rgba(37, 99, 235, 0.4), 0 2px 8px -2px rgba(37, 99, 235, 0.2)',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Memproses...
                  </>
                ) : (
                  <>
                    Masuk
                    <ArrowRight className="h-5 w-5 ml-2 transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={mounted ? { opacity: 1 } : {}}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="text-center pt-1"
            >
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-sm font-medium text-blue-600 transition-all duration-300 hover:text-blue-800 hover:underline underline-offset-4 decoration-blue-400/40"
              >
                Lupa Password?
              </button>
            </motion.div>
          </form>

          {/* ===== INFO SECTION ===== */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={mounted ? { opacity: 1 } : {}}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="mt-6 pt-5 border-t border-gray-200/60"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-blue-50/50 border border-blue-100/60 backdrop-blur-sm">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-gray-500 text-xs leading-relaxed">
                <span className="font-semibold text-gray-600">Butuh bantuan?</span> Hubungi admin untuk masalah login.
              </p>
            </div>
          </motion.div>
        </div>

        {/* ===== FOOTER ===== */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={mounted ? { opacity: 1 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-center text-white/40 text-xs mt-6 font-medium tracking-wide"
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
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={() => { setShowForgotModal(false); setForgotNip(''); }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md"
          >
            <div
              className="rounded-3xl overflow-hidden border border-white/[0.18]"
              style={{
                background: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.4), 0 8px 24px -8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
              }}
            >
              {/* Modal Header with Blue Gradient */}
              <div
                className="px-7 py-6"
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 40%, #1e40af 100%)',
                  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.1)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/25 shadow-lg shadow-black/10">
                      <KeyRound className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">Lupa Password</h3>
                      <p className="text-blue-200/80 text-sm mt-0.5">Reset melalui admin</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowForgotModal(false); setForgotNip(''); }}
                    className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white hover:scale-110 active:scale-95 transition-all duration-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-7 py-7 space-y-5">
                <p className="text-gray-500 text-sm leading-relaxed">
                  Masukkan NIP untuk mengirim permintaan reset password ke admin.
                </p>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-gray-700">NIP</Label>
                  <div className="relative group">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 transition-all duration-300 group-focus-within:text-blue-600 group-focus-within:scale-110" />
                    <Input
                      type="text"
                      value={forgotNip}
                      onChange={(e) => setForgotNip(e.target.value)}
                      placeholder="Masukkan NIP"
                      className="pl-11 h-12 rounded-xl border-gray-200/80 bg-white/60 text-gray-800 placeholder:text-gray-400 transition-all duration-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:shadow-lg focus:shadow-blue-500/5 hover:border-gray-300 hover:bg-white/80"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleForgotPassword}
                    disabled={forgotLoading}
                    className="flex-1 h-12 font-bold rounded-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-600/20 active:scale-[0.97] disabled:opacity-70 disabled:hover:scale-100 cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
                      color: 'white',
                      boxShadow: '0 6px 20px -4px rgba(37, 99, 235, 0.35)',
                    }}
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
                    className="flex-1 h-12 font-bold rounded-xl border-gray-200/80 text-gray-600 hover:bg-gray-50/80 hover:text-gray-700 hover:border-gray-300 hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 cursor-pointer"
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
