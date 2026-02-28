'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface PenjualanDetail {
  id: string;
  jenis_daging: string | null;
  ekor: number | null;
  berat: number;
  harga: number;
  subtotal: number;
}

interface PenjualanData {
  id: string;
  nomor_nota: string | null;
  customer: { nama: string };
  tanggal: string;
  grand_total: number;
  jumlah_bayar: number;
  sisa_piutang: number;
  status: string;
  status_cetak: boolean;
  created_at: string;
  updated_at: string;
  detail: PenjualanDetail[];
  pembayaran_log: { id: string; created_at: string }[];
  pembayaran: { id: string; jumlah_bayar: number; metode: string; tanggal: string; created_at: string }[];
}

const formatRupiah = (num: number): string => {
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const formatTanggal = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatWaktu = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Pad/truncate string to fixed width
const padRight = (str: string, len: number): string => {
  if (str.length > len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
};

const padLeft = (str: string, len: number): string => {
  if (str.length > len) return str.substring(0, len);
  return ' '.repeat(len - str.length) + str;
};

const LINE_WIDTH = 90;
const SEPARATOR = '='.repeat(LINE_WIDTH);
const DASH_LINE = '-'.repeat(LINE_WIDTH);

export default function PrintNotaPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<PenjualanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/penjualan/${id}`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || 'Gagal memuat data');
        }
      } catch {
        setError('Terjadi kesalahan');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Auto print when data loaded
  useEffect(() => {
    if (data && !loading) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [data, loading]);

  if (loading) {
    return (
      <div
        style={{
          fontFamily: 'monospace',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        Memuat data...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          fontFamily: 'monospace',
          padding: '20px',
          textAlign: 'center',
          color: 'red',
        }}
      >
        {error || 'Data tidak ditemukan'}
      </div>
    );
  }

  // NOTA REVISI jika ada lebih dari 1 pembayaran (ada tambahan setelah finalisasi)
  const isRevisi = (data.pembayaran && data.pembayaran.length > 1) || 
    (data.pembayaran_log && data.pembayaran_log.length > 0);
  const isReprint = data.status_cetak; // already printed before

  // Build detail lines
  const detailLines: string[] = [];
  data.detail.forEach((d) => {
    const itemName = d.jenis_daging || 'Ayam Hidup';
    
    if (d.ekor && d.ekor > 0) {
      const ekorStr = `${d.ekor} ek`;
      const hargaStr = formatRupiah(d.harga);
      const subtotalStr = formatRupiah(d.subtotal);
      const line =
        padRight(itemName, 30) +
        padLeft(ekorStr, 14) +
        padLeft(hargaStr, 23) +
        padLeft(subtotalStr, 23);
      detailLines.push(line);
      const beratLine =
        padRight('  Berat', 30) + padLeft(`${d.berat.toLocaleString('id-ID')} kg`, 14);
      detailLines.push(beratLine);
    } else {
      const beratStr = `${d.berat.toLocaleString('id-ID')} kg`;
      const hargaStr = formatRupiah(d.harga);
      const subtotalStr = formatRupiah(d.subtotal);
      const line =
        padRight(itemName, 30) +
        padLeft(beratStr, 14) +
        padLeft(hargaStr, 23) +
        padLeft(subtotalStr, 23);
      detailLines.push(line);
    }
  });

  const totalStr = formatRupiah(data.grand_total);
  const bayarStr = formatRupiah(data.jumlah_bayar);
  const sisaStr = formatRupiah(data.sisa_piutang);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: 241.3mm 279.4mm;
                margin: 5mm 8mm 5mm 8mm;
              }
              body {
                font-family: 'Courier New', Courier, monospace !important;
                font-size: 15px !important;
                line-height: 1.4 !important;
                color: #000 !important;
                background: #fff !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print {
                display: none !important;
              }
              .nota-wrapper {
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                padding: 0 !important;
              }
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 15px;
              line-height: 1.4;
              color: #000;
              background: #f5f5f5;
              margin: 0;
              padding: 20px;
            }
            .nota-wrapper {
              width: 241.3mm;
              max-width: 100%;
              margin: 0 auto;
              padding: 5mm 8mm;
              white-space: pre;
              word-wrap: break-word;
              background: #fff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              box-sizing: border-box;
            }
            .nota-line {
              margin: 0;
              padding: 0;
              white-space: pre;
            }
            .no-print {
              text-align: center;
              margin-bottom: 20px;
            }
            .no-print button {
              font-family: sans-serif;
              padding: 8px 24px;
              font-size: 14px;
              cursor: pointer;
              background: #000;
              color: #fff;
              border: none;
              border-radius: 4px;
              margin: 0 4px;
            }
            .no-print button:hover {
              background: #333;
            }
            .revisi-header {
              text-align: center;
              font-weight: bold;
              margin-bottom: 4px;
            }
          `,
        }}
      />

      <div className="no-print">
        <button onClick={() => window.print()}>🖨️ Cetak Nota</button>
        <button onClick={() => window.close()}>✕ Tutup</button>
      </div>

      <div className="nota-wrapper">
        <pre className="nota-line">{SEPARATOR}</pre>

        {isRevisi && (
          <>
            <pre className="nota-line revisi-header">
              {'                                   *** NOTA REVISI ***'}
            </pre>
            <pre className="nota-line">
              {'       Revisi pada: ' + formatWaktu(data.updated_at)}
            </pre>
          </>
        )}

        {!isRevisi && isReprint && (
          <>
            <pre className="nota-line revisi-header">
              {'                                   *** CETAK ULANG ***'}
            </pre>
          </>
        )}

        {/* Header: Company info (left) + Nota info (right) */}
        <pre className="nota-line">
          {padRight('CV ASWI SENTOSA LAMPUNG', 55) + 'NOTA PENJUALAN'}
        </pre>
        <pre className="nota-line">
          {padRight('JL. MUFAKAT WAWAI, YUKUM JAYA', 55) + 'No Nota  : ' + (data.nomor_nota || 'DRAFT')}
        </pre>
        <pre className="nota-line">
          {padRight('No Telp. 0851-9975-2567', 55) + 'Tanggal  : ' + formatTanggal(data.tanggal)}
        </pre>
        <pre className="nota-line">
          {padRight('', 55) + 'Customer : ' + data.customer.nama}
        </pre>
        <pre className="nota-line">
          {padRight('', 55) + 'Kurir    : '}
        </pre>

        <pre className="nota-line">{DASH_LINE}</pre>
        <pre className="nota-line">
          {padRight('ITEM', 30) +
            padLeft('QTY', 14) +
            padLeft('HARGA', 23) +
            padLeft('TOTAL', 23)}
        </pre>
        <pre className="nota-line">{DASH_LINE}</pre>

        {detailLines.map((line, i) => (
          <pre key={i} className="nota-line">
            {line}
          </pre>
        ))}

        <pre className="nota-line">{DASH_LINE}</pre>
        <pre className="nota-line">
          {padRight('TOTAL', 45) + padLeft(totalStr, 45)}
        </pre>
        <pre className="nota-line">
          {padRight('Bayar', 45) + padLeft(bayarStr, 45)}
        </pre>
        <pre className="nota-line">
          {padRight('Sisa', 45) + padLeft(sisaStr, 45)}
        </pre>
        <pre className="nota-line">
          {padRight('Status', 45) + padLeft(data.status.toUpperCase(), 45)}
        </pre>
        <pre className="nota-line">{DASH_LINE}</pre>
        <pre className="nota-line">
          {padRight('Yang Menerima,', 45) + padLeft('Hormat Kami,', 45)}
        </pre>
        <pre className="nota-line">
          {padRight('', 45) + padLeft('Bagian Penjualan', 45)}
        </pre>
        <pre className="nota-line">{' '}</pre>
        <pre className="nota-line">{' '}</pre>
        <pre className="nota-line">
          {padRight('(....................)', 45) + padLeft('(DWI FATMAWATI)', 45)}
        </pre>
        <pre className="nota-line">{SEPARATOR}</pre>
      </div>
    </>
  );
}
