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

  // Reverse geocode via server-side API (HERE Maps primary, Nominatim fallback)
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

  // Get user location
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Browser tidak mendukung geolocation');
      setLoading(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = position.coords.accuracy;

        console.log(`[AbsensiMap] GPS: ${lat}, ${lng} (akurasi: ${acc}m)`);
        setLocation({ latitude: lat, longitude: lng });
        setAccuracy(acc);
        setLoading(false);

        // Reverse geocode
        const addr = await reverseGeocode(lat, lng);
        setAddress(addr);

        // Notify parent
        if (onLocationChange) {
          onLocationChange({ latitude: lat, longitude: lng, address: addr });
        }

        // Update marker & map
        if (markerRef.current) {
          markerRef.current.setLngLat([lng, lat]);
        }
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [lng, lat], zoom: 16, speed: 1.5 });
        }
      },
      (err) => {
        console.error('[AbsensiMap] Geolocation error:', err);
        if (err.code === 1) {
          setError('Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser Anda.');
        } else if (err.code === 2) {
          setError('Lokasi tidak tersedia. Pastikan GPS aktif.');
        } else {
          setError('Gagal mendapatkan lokasi. Coba lagi.');
        }
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Initialize map when location is available
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
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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

    // Add navigation controls
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    // Custom marker element
    const markerEl = document.createElement('div');
    markerEl.innerHTML = `
      <div style="position:relative;width:40px;height:52px;">
        <svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 0C8.954 0 0 8.954 0 20c0 14 20 32 20 32s20-18 20-32C40 8.954 31.046 0 20 0z" fill="#3b82f6"/>
          <circle cx="20" cy="18" r="8" fill="white"/>
          <circle cx="20" cy="18" r="4" fill="#3b82f6"/>
        </svg>
        <div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:12px;height:4px;background:rgba(0,0,0,0.2);border-radius:50%;"></div>
      </div>
    `;

    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'bottom' })
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

  // Loading state
  if (loading) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gray-50 rounded-xl shadow-md ${className}`}
        style={{ height }}
      >
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-3"></div>
        <p className="text-sm text-muted-foreground">Mendapatkan lokasi...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-red-50 border border-red-200 rounded-xl shadow-md p-4 ${className}`}
        style={{ height }}
      >
        <svg className="w-10 h-10 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
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
      {/* Map */}
      <div
        ref={mapContainerRef}
        style={{ height, width: '100%' }}
        className="rounded-xl overflow-hidden shadow-md"
      />

      {/* Address */}
      {showAddress && address && (
        <div className="mt-3 flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
          <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div>
            <p className="text-sm text-gray-600 leading-snug">{address}</p>
            {accuracy && (
              <p className="text-xs text-gray-400 mt-0.5">Akurasi: ~{Math.round(accuracy)}m</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AbsensiMap;
