'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';

const AbsensiMap = dynamic(() => import('@/components/AbsensiMap'), { ssr: false });

interface CameraProps {
  onCapture: (photo: Blob, latitude: number, longitude: number) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export const Camera: React.FC<CameraProps> = ({ onCapture, onCancel, isSubmitting = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(true);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Get user location with continuous updates for high accuracy
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          console.log(`[GPS] Lokasi: ${lat}, ${lon} (akurasi: ${accuracy}m)`);
          setLocation({ latitude: lat, longitude: lon });

          // Reverse geocode via server-side API (supports HERE Maps + Nominatim fallback)
          try {
            const res = await fetch(`/api/absensi/geocode?lat=${lat}&lon=${lon}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.address) {
                setLocationAddress(data.address);
              }
            }
          } catch (e) {
            console.error('Reverse geocoding error:', e);
          }

          setIsLoadingLocation(false);
        },
        (err) => {
          console.error('Geolocation error:', err);
          setError('Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin lokasi diberikan.');
          setIsLoadingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setError('Browser tidak mendukung geolocation');
      setIsLoadingLocation(false);
    }
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setIsLoadingCamera(true);
      setError(null);
      
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      setIsLoadingCamera(false);
    } catch (err) {
      console.error('Camera error:', err);
      setError('Gagal mengakses kamera. Pastikan izin kamera diberikan.');
      setIsLoadingCamera(false);
    }
  }, [facingMode, stream]);

  useEffect(() => {
    startCamera();
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Restart camera when facing mode changes
  useEffect(() => {
    if (!capturedImage) {
      startCamera();
    }
  }, [facingMode]);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Mirror image for front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0);
    
    // Convert to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setCapturedImage(canvas.toDataURL('image/jpeg', 0.85));
        }
      },
      'image/jpeg',
      0.85
    );
  }, [facingMode]);

  // Retake photo
  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    setCapturedBlob(null);
  }, []);

  // Switch camera
  const switchCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  // Submit photo
  const handleSubmit = useCallback(() => {
    if (capturedBlob && location) {
      onCapture(capturedBlob, location.latitude, location.longitude);
    }
  }, [capturedBlob, location, onCapture]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    onCancel();
  }, [stream, onCancel]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900">
        <button
          onClick={handleCancel}
          className="text-white p-2 hover:bg-gray-700 rounded-lg transition-colors"
          disabled={isSubmitting}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-white font-semibold">Ambil Foto Absensi</h2>
        <button
          onClick={switchCamera}
          className="text-white p-2 hover:bg-gray-700 rounded-lg transition-colors"
          disabled={isSubmitting || !!capturedImage}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Camera View / Captured Image */}
      <div className="flex-1 relative overflow-hidden bg-gray-900">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-red-900/50 text-red-200 p-4 rounded-lg text-center max-w-md">
              <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p>{error}</p>
              <button
                onClick={startCamera}
                className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        ) : capturedImage ? (
          <img
            src={capturedImage}
            alt="Captured"
            className="w-full h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              onLoadedMetadata={() => setIsLoadingCamera(false)}
            />
            {isLoadingCamera && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-3"></div>
                  <p>Memuat kamera...</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Location Status + Mini Map */}
        <div className="absolute bottom-4 left-4 right-4 space-y-2">
          {/* Mini Map */}
          {location && !capturedImage && (
            <div className="rounded-lg overflow-hidden shadow-lg" style={{ height: '120px' }}>
              <AbsensiMap
                height="120px"
                showAddress={false}
                interactive={false}
              />
            </div>
          )}
          {/* Location Text */}
          <div className={`p-3 rounded-lg ${location ? 'bg-green-900/70' : 'bg-yellow-900/70'}`}>
            <div className="flex items-center gap-2 text-white text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {isLoadingLocation ? (
                <span>Mendapatkan lokasi...</span>
              ) : location ? (
                <span className="leading-tight">{locationAddress || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}</span>
              ) : (
                <span>Lokasi tidak tersedia</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for capturing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="p-4 bg-gray-900">
        {capturedImage ? (
          <div className="flex gap-4 justify-center">
            <button
              onClick={retakePhoto}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-full transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Ulangi
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !location}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-full transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Mengirim...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Kirim Absen
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={capturePhoto}
              disabled={isLoadingCamera || !location}
              className="w-20 h-20 rounded-full bg-white hover:bg-gray-200 transition-colors flex items-center justify-center disabled:opacity-50 border-4 border-gray-400"
            >
              <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-400"></div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Camera;
