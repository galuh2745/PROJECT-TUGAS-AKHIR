'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet + Next.js/Webpack
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

interface LeafletMapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
  height?: string;
  popupText?: string;
  className?: string;
  showRadius?: boolean;
  radiusMeters?: number;
}

const LeafletMap: React.FC<LeafletMapProps> = ({
  latitude,
  longitude,
  zoom = 16,
  height = '200px',
  popupText,
  className = '',
  showRadius = false,
  radiusMeters = 100,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    // Gunakan HERE Maps tiles jika API key tersedia, fallback ke OSM
    const hereApiKey = process.env.NEXT_PUBLIC_HERE_API_KEY;
    if (hereApiKey) {
      L.tileLayer(
        'https://{s}.base.maps.ls.hereapi.com/maptile/2.1/maptile/newest/normal.day/{z}/{x}/{y}/256/png8?apiKey=' + hereApiKey,
        {
          attribution: '&copy; <a href="https://www.here.com">HERE Maps</a>',
          subdomains: ['1', '2', '3', '4'],
          maxZoom: 20,
        }
      ).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
    }

    const marker = L.marker([latitude, longitude]).addTo(map);
    if (popupText) {
      marker.bindPopup(popupText).openPopup();
    }

    if (showRadius) {
      const circle = L.circle([latitude, longitude], {
        radius: radiusMeters,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);
      circleRef.current = circle;
    }

    mapRef.current = map;
    markerRef.current = marker;

    // Force resize after mount
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  // Update position when lat/lng changes
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    const latLng = L.latLng(latitude, longitude);
    mapRef.current.setView(latLng, mapRef.current.getZoom());
    markerRef.current.setLatLng(latLng);

    if (circleRef.current) {
      circleRef.current.setLatLng(latLng);
    }
  }, [latitude, longitude]);

  // Update popup text
  useEffect(() => {
    if (!markerRef.current) return;
    if (popupText) {
      markerRef.current.bindPopup(popupText).openPopup();
    }
  }, [popupText]);

  return (
    <div
      ref={mapContainerRef}
      style={{ height, width: '100%' }}
      className={`rounded-lg overflow-hidden border border-gray-200 z-0 ${className}`}
    />
  );
};

export default LeafletMap;
