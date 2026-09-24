'use client';

import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  Lock,
  Download,
  Trash2,
  ArrowLeft,
  RefreshCw,
  HardDrive,
  Film,
  Image as ImageIcon,
  Play,
  X,
  Volume2,
} from 'lucide-react';

interface R2MediaItem {
  key: string;
  size: number;
  lastModified: string;
  url: string;
  type: 'photo' | 'video';
}

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [items, setItems] = useState<R2MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected media for modal preview
  const [previewItem, setPreviewItem] = useState<R2MediaItem | null>(null);

  // ZIP download state
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const fetchItems = async (adminPin: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/media', {
        headers: { 'x-admin-pin': adminPin },
      });
      if (!res.ok) throw new Error('Yetkisiz erişim veya hatalı PIN.');
      const data = await res.json();
      setItems(data.items || []);
      setIsAuthenticated(true);
    } catch (err: any) {
      setError(err.message || 'Veriler alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems(pin);
  };

  const handleDelete = async (key: string) => {
    if (!window.confirm('Bu dosyayı Cloudflare R2 üzerinden kalıcı olarak silmek istiyor musunuz?')) return;
    try {
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.key !== key));
        if (previewItem?.key === key) setPreviewItem(null);
      }
    } catch {
      alert('Silme işlemi başarısız oldu.');
    }
  };

  const handleDownloadAllZip = async () => {
    if (items.length === 0) return;
    setIsZipping(true);
    setZipProgress(0);

    try {
      const zip = new JSZip();
      const folder = zip.folder('buse-berkay-dugun-anilar');

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          const res = await fetch(item.url);
          const blob = await res.blob();
          const fileName = item.key.replace(/^anilar\//, '');
          folder?.file(fileName, blob);
        } catch (e) {
          console.error(`Download failed for ${item.key}:`, e);
        }
        setZipProgress(Math.round(((i + 1) / items.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buse-berkay-anilar-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Toplu indirme sırasında bir hata oluştu.');
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  const totalBytes = items.reduce((acc, i) => acc + (i.size || 0), 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  const photoCount = items.filter((i) => i.type === 'photo').length;
  const videoCount = items.filter((i) => i.type === 'video').length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-100">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-stone-200 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h1 className="font-serif-luxury text-2xl font-bold text-stone-900">
              Yönetici Girişi
            </h1>
            <p className="text-xs text-stone-500 mt-1">
              Buse & Berkay özel anı arşivi yönetimi
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                maxLength={8}
                className="w-full text-center tracking-widest text-lg px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !pin}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Doğrulanıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <a
            href="/"
            className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Yükleme Sayfasına Dön</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20 px-4 py-3 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="p-2 rounded-xl hover:bg-stone-100 text-stone-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div>
              <h1 className="font-serif-luxury text-lg sm:text-xl font-bold text-stone-900">
                Buse & Berkay Anı Arşivi
              </h1>
              <p className="text-[11px] text-stone-500">Cloudflare R2 Depolama</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchItems(pin)}
              className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleDownloadAllZip}
              disabled={isZipping || items.length === 0}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isZipping ? `İndiriliyor (%${zipProgress})` : 'Tümünü ZIP İndir'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 sm:px-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Fotoğraf</p>
              <p className="text-lg font-bold text-stone-800">{photoCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Video (1.0x Doğal Hız)</p>
              <p className="text-lg font-bold text-stone-800">{videoCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Toplam Boyut</p>
              <p className="text-lg font-bold text-stone-800">{totalMb} MB</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Depolama</p>
              <p className="text-sm font-bold text-stone-800">Cloudflare R2</p>
            </div>
          </div>
        </div>

        {/* Gallery */}
        {items.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-stone-200">
            <h3 className="font-bold text-stone-800">Henüz Anı Yüklenmedi</h3>
            <p className="text-xs text-stone-500 mt-1">
              Davetliler fotoğraf ve video yükledikçe burada listelenecektir.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {items.map((item) => (
              <div
                key={item.key}
                className="group relative bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-sm flex flex-col hover:border-rose-300 transition-colors cursor-pointer"
                onClick={() => setPreviewItem(item)}
              >
                <div className="aspect-square bg-stone-900 relative overflow-hidden flex items-center justify-center">
                  {item.type === 'video' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-stone-900 text-white p-2 text-center relative">
                      <video
                        src={item.url}
                        preload="metadata"
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover opacity-60"
                      />
                      <div className="relative z-10 w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="w-6 h-6 fill-white ml-0.5" />
                      </div>
                      <span className="relative z-10 text-[10px] text-stone-200 mt-2 font-medium bg-black/60 px-2 py-0.5 rounded-full">
                        1.0x Sesli Video
                      </span>
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      alt="Anı"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  )}

                  <div
                    className="absolute top-2 right-2 flex gap-1 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={item.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 bg-white/90 hover:bg-white text-stone-800 rounded-lg shadow-sm"
                      title="İndir"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => handleDelete(item.key)}
                      className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm cursor-pointer"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-2.5 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-100 bg-white">
                  <span className="truncate max-w-[120px] font-medium text-stone-700">
                    {item.key.replace(/^anilar\//, '')}
                  </span>
                  <span>{(item.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Media Preview (Plays video with sound & 1.0x speed) */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-stone-900 rounded-3xl overflow-hidden shadow-2xl border border-stone-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 bg-stone-900/90 text-white border-b border-stone-800">
              <div className="flex items-center gap-2">
                {previewItem.type === 'video' ? (
                  <Film className="w-4 h-4 text-rose-400" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-rose-400" />
                )}
                <span className="text-xs font-semibold truncate max-w-xs">
                  {previewItem.key.replace(/^anilar\//, '')}
                </span>
                <span className="text-[10px] text-stone-400">
                  ({(previewItem.size / (1024 * 1024)).toFixed(1)} MB)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewItem.url}
                  download
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>İndir</span>
                </a>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[75vh]">
              {previewItem.type === 'video' ? (
                <video
                  src={previewItem.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[75vh] w-auto max-w-full rounded-b-2xl"
                />
              ) : (
                <img
                  src={previewItem.url}
                  alt="Preview"
                  className="max-h-[75vh] w-auto max-w-full object-contain"
                />
              )}
            </div>

            {previewItem.type === 'video' && (
              <div className="p-3 bg-stone-900 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-rose-400" />
                  <span>Orijinal Stereo Ses & 1.0x Doğal Hız</span>
                </div>
                <span>Cloudflare R2 Direct Stream</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
