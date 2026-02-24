'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

interface AbsensiMapProps {
  onLocationChange?: (location: LocationData) => void;
  height?: string;
  showAddress?: boolean;
  className?: string;
  interactive?: boolean;
}

const AbsensiMap: React.FC<AbsensiMapProps> = ({
  onLocationChange,
  height = '250px',
  showAddress = true,
  className = '',
  interactive = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/absensi/geocode?lat=${lat}&lon=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.address) {
          return data.address;
        }
      }
    } catch (err) {
      console.error('[AbsensiMap] Reverse geocode error:', err);
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Browser tidak mendukung geolocation');
      setLoading(false);
      return;
    }

    const getLocation = (highAccuracy: boolean) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const acc = position.coords.accuracy;

          console.log('[AbsensiMap] GPS:', lat, lng, 'Akurasi:', acc);

          setLocation({ latitude: lat, longitude: lng });
          setAccuracy(acc);
          setLoading(false);

          const addr = await reverseGeocode(lat, lng);
          setAddress(addr);

          if (onLocationChange) {
            onLocationChange({ latitude: lat, longitude: lng, address: addr });
          }
        },
        (err) => {
          console.log('Geolocation error code:', err.code);
          console.log('Geolocation error message:', err.message);

          // Fallback: kalau high accuracy gagal, coba tanpa high accuracy
          if (highAccuracy) {
            console.log('Retry without high accuracy...');
            getLocation(false);
            return;
          }

          if (err.code === 1) {
            setError('Izin lokasi ditolak. Aktifkan izin lokasi di browser.');
          } else if (err.code === 2) {
            setError('Lokasi tidak tersedia. Pastikan GPS aktif.');
          } else if (err.code === 3) {
            setError('Timeout mendapatkan lokasi. Aktifkan mode High Accuracy.');
          } else {
            setError('Gagal mendapatkan lokasi.');
          }

          setLoading(false);
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 30000,
          maximumAge: 10000,
        }
      );
    };

    getLocation(true);
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || !location || mapRef.current) return;

    const map = new maplibregl.Map({
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
            attribution: '&copy; OpenStreetMap',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [location.longitude, location.latitude],
      zoom: 16,
      interactive: interactive,
    });

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    const marker = new maplibregl.Marker()
      .setLngLat([location.longitude, location.latitude])
      .addTo(map);

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [location, interactive]);

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-xl shadow-md ${className}`}
        style={{ height }}
      >
        <p className="text-sm text-gray-500">Mendapatkan lokasi...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-red-50 border border-red-200 rounded-xl p-4 ${className}`}
        style={{ height }}
      >
        <p className="text-sm text-red-600 text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 px-4 py-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={mapContainerRef}
        style={{ height, width: '100%' }}
        className="rounded-xl overflow-hidden shadow-md"
      />

      {showAddress && address && (
        <div className="mt-3 text-sm text-gray-600">
          {address}
          {accuracy && (
            <div className="text-xs text-gray-400">
              Akurasi: ±{Math.round(accuracy)} meter
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AbsensiMap;