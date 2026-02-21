import { jsPDF } from 'jspdf';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export interface PdfMeta {
  title: string;
  subject: string;
}

export async function getAuthInfo() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return null;
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  return payload as { userId: number; role: string; name?: string };
}

export function initPdf(orientation: 'portrait' | 'landscape' = 'portrait') {
  return new jsPDF({ orientation, unit: 'mm', format: 'a4' });
}

export function addWatermark(doc: jsPDF) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(50);
  doc.setTextColor(200, 200, 200);
  doc.setFont('helvetica', 'bold');
  doc.text('CV ASWI SENTOSA LAMPUNG', pw / 2, ph / 2, { align: 'center', angle: 45 });
  doc.setTextColor(0, 0, 0);
}

export function addHeader(doc: jsPDF, reportTitle: string, subtitle?: string) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CV ASWI SENTOSA LAMPUNG', pw / 2, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Jl mufakat wawai, Yukum Jaya, lingkungan VB, Kabupaten Lampung Tengah, Lampung', pw / 2, 21, { align: 'center' });
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(14, 24, pw - 14, 24);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, pw / 2, 31, { align: 'center' });
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pw / 2, 37, { align: 'center' });
  }
}

export function addFooter(doc: jsPDF, userName?: string) {
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 14, ph - 25);
  doc.text('Mengetahui: Agus Tri Widodo', 14, ph - 20);
  doc.text(`Dicetak oleh: ${userName || 'Admin'}`, 14, ph - 15);
  doc.text('Tercetak otomatis dari sistem - CV Aswi Sentosa Lampung', 14, ph - 10);
}

export function setMeta(doc: jsPDF, meta: PdfMeta) {
  doc.setProperties({
    title: meta.title,
    subject: meta.subject,
    author: 'CV Aswi Sentosa Lampung',
    creator: 'Sistem Absensi & Inventory CV Aswi Sentosa',
  });
}

export function fmtRp(n: number): string {
  return 'Rp ' + Math.abs(n).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtNum(n: number): string {
  return n.toLocaleString('id-ID');
}
