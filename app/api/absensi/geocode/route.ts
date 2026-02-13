import { NextRequest, NextResponse } from 'next/server';

const HERE_API_KEY = process.env.HERE_API_KEY || '';

// GET /api/absensi/geocode?lat=xxx&lon=xxx
// Server-side reverse geocoding agar API key tidak terekspos di client
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat dan lon harus diisi' }, { status: 400 });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  // Coba HERE Maps dulu
  if (HERE_API_KEY) {
    try {
      console.log('[Geocode API] Menggunakan HERE Maps API...');
      const hRes = await fetch(
        `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${latitude},${longitude}&lang=id&apiKey=${HERE_API_KEY}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (hRes.ok) {
        const hData = await hRes.json();
        if (hData.items?.length > 0) {
          const label = (hData.items[0].address?.label || '')
            .replace(/,\s*Indonesia$/i, '')
            .trim();
          if (label) {
            console.log('[Geocode API] HERE Maps berhasil:', label);
            return NextResponse.json({ success: true, address: label });
          }
        }
        console.warn('[Geocode API] HERE Maps response OK tapi tidak ada hasil');
      } else {
        const errBody = await hRes.text();
        console.error(`[Geocode API] HERE Maps gagal (${hRes.status}):`, errBody);
      }
    } catch (err) {
      console.error('[Geocode API] HERE Maps error:', err);
    }
  } else {
    console.log('[Geocode API] HERE_API_KEY tidak diset, langsung pakai Nominatim');
  }

  // Fallback: Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=id&zoom=18`,
      {
        headers: { 'User-Agent': 'AbsensiApp/1.0' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const displayName = data.display_name || '';

      if (displayName) {
        const cleaned = displayName
          .replace(/,\s*(Indonesia)$/i, '')
          .replace(/,\s*(Sumatra|Sumatera)\s*,?/i, '')
          .replace(/,\s*,/g, ',')
          .replace(/,\s*$/g, '')
          .trim();
        if (cleaned) {
          return NextResponse.json({ success: true, address: cleaned });
        }
      }
    }
  } catch (err) {
    console.error('Nominatim geocoding error:', err);
  }

  return NextResponse.json({
    success: true,
    address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  });
}
