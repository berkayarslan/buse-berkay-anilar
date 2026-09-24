'use client';

import React, { useState } from 'react';
import JSZip from 'jszip';
import { Lock, Download, Trash2, ArrowLeft, RefreshCw, HardDrive, Film, Image as ImageIcon } from 'lucide-react';

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
      }
    } catch (err) {
      alert('Silinemedi.');
    }
  };

  const handleDownloadAllZip = async () => {
    if (items.length === 0) return;
    setIsZipping(true);
    setZipProgress(5);

    try {
      const zip = new JSZip();
      const folder = zip.folder('Buse_Berkay_R2_Anilar');

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setZipProgress(Math.round(((i + 1) / items.length) * 85));
        try {
          const res = await fetch(item.url);
          const blob = await res.blob();
          const cleanName = item.key.replace(/^anilar\//, '') || `medya_${i + 1}.jpg`;
          folder?.file(cleanName, blob);
        } catch (e) {
          console.warn('Zip file download error:', e);
        }
      }

      setZipProgress(95);
      const zipContent = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipContent);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Buse_Berkay_Dugun_R2_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-stone-100">
        <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl border border-stone-200 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="font-serif-luxury text-xl font-bold text-stone-900">Buse & Berkay Arşiv Girişi</h1>
          <p className="text-xs text-stone-500">Cloudflare R2 anılarını görüntülemek için PIN giriniz.</p>

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN Kodu (Varsayılan: 1810)"
              className="w-full text-center py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-rose-500"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold"
            >
              {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <a href="/" className="inline-block text-xs text-stone-500 hover:text-stone-800">
            ← Yükleme Sayfasına Dön
          </a>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="p-2 bg-stone-100 hover:bg-stone-200 rounded-xl text-stone-700">
            <ArrowLeft className="w-4 h-4" />
          </a>
          <div>
            <h1 className="font-serif-luxury text-lg font-bold text-stone-900">Cloudflare R2 Anı Arşivi</h1>
            <p className="text-xs text-stone-500">Toplam: {items.length} dosya</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchItems(pin)}
            className="p-2 bg-stone-100 hover:bg-stone-200 rounded-xl text-xs font-semibold flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>

          <button
            onClick={handleDownloadAllZip}
            disabled={isZipping || items.length === 0}
            className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-amber-300" />
            <span>{isZipping ? `İndiriliyor (${zipProgress}%)` : 'Tümünü ZIP İndir'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {items.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-stone-300">
            <HardDrive className="w-12 h-12 text-stone-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-stone-700">R2 Bucket'ında henüz dosya yok.</p>
            <p className="text-xs text-stone-500 mt-1">Davetliler yükledikçe burada listelenecektir.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col group">
                <div className="aspect-square bg-stone-100 overflow-hidden relative">
                  {item.type === 'video' ? (
                    <video src={item.url} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={item.url} alt="Media" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  )}
                </div>

                <div className="p-2.5 flex items-center justify-between text-xs border-t border-stone-100">
                  <span className="text-[10px] text-stone-500 font-mono truncate max-w-[100px]">
                    {item.key.replace(/^anilar\//, '')}
                  </span>

                  <div className="flex items-center gap-1">
                    <a
                      href={item.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-stone-100 rounded text-stone-600"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => handleDelete(item.key)}
                      className="p-1 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
