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
  CheckSquare,
  Square,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';

interface R2MediaItem {
  key: string;
  size: number;
  lastModified: string;
  url: string;
  type: 'photo' | 'video';
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function FenerbahceAdminPage() {
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [items, setItems] = useState<R2MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-selection state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

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
      setSelectedKeys(new Set());
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

  // Toggle selection for a single card
  const toggleSelectKey = (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Select all or clear selection
  const handleSelectAllToggle = () => {
    if (selectedKeys.size === items.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(items.map((i) => i.key)));
    }
  };

  // Delete single item
  const handleDeleteSingle = async (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Bu dosyayı Cloudflare R2 üzerinden kalıcı olarak silmek istiyor musunuz?')) return;

    setIsDeleting(true);
    try {
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.key !== key));
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        if (previewItem?.key === key) setPreviewItem(null);
      } else {
        alert('Silme işlemi başarısız oldu.');
      }
    } catch {
      alert('Silme işlemi başarısız oldu.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete selected items
  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) return;
    const count = selectedKeys.size;
    const confirmed = window.confirm(
      `Seçili ${count} adet fotoğraf/videoyu Cloudflare R2'den KALICI OLARAK silmek istediğinizden emin misiniz?`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteNotice(`${count} dosya siliniyor...`);
    try {
      const keysArray = Array.from(selectedKeys);
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ keys: keysArray }),
      });

      if (res.ok) {
        setItems((prev) => prev.filter((i) => !selectedKeys.has(i.key)));
        setSelectedKeys(new Set());
        if (previewItem && selectedKeys.has(previewItem.key)) {
          setPreviewItem(null);
        }
        setDeleteNotice(`${count} dosya başarıyla silindi.`);
        setTimeout(() => setDeleteNotice(null), 3000);
      } else {
        alert('Seçilen dosyaları silme işlemi başarısız oldu.');
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete ALL items
  const handleDeleteAll = async () => {
    if (items.length === 0) return;
    const confirmed1 = window.confirm(
      `⚠️ DİKKAT: Arşivdeki TÜM fotoğrafları ve videoları (${items.length} adet) kalıcı olarak silmek üzeresiniz!\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`
    );
    if (!confirmed1) return;

    const confirmed2 = window.confirm(
      `Son onay: Buse & Berkay Cloudflare R2 arşivindeki ${items.length} adet dosyanın TAMAMI silinecektir. Emin misiniz?`
    );
    if (!confirmed2) return;

    setIsDeleting(true);
    setDeleteNotice('Tüm arşiv siliniyor...');
    try {
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ all: true }),
      });

      if (res.ok) {
        setItems([]);
        setSelectedKeys(new Set());
        setPreviewItem(null);
        setDeleteNotice('Tüm arşiv başarıyla temizlendi.');
        setTimeout(() => setDeleteNotice(null), 4000);
      } else {
        alert('Tümünü silme işlemi başarısız oldu.');
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Download All as ZIP
  const handleDownloadAllZip = async () => {
    if (items.length === 0) return;
    setIsZipping(true);
    setZipProgress(0);
    try {
      const zip = new JSZip();
      const folder = zip.folder('buse-berkay-dugun-anilar');

      // If user has selections, download only selected; else download all
      const itemsToDownload = selectedKeys.size > 0
        ? items.filter((i) => selectedKeys.has(i.key))
        : items;

      for (let i = 0; i < itemsToDownload.length; i++) {
        const item = itemsToDownload[i];
        try {
          const res = await fetch(item.url);
          const blob = await res.blob();
          const fileName = item.key.replace(/^anilar\//, '');
          folder?.file(fileName, blob);
        } catch (e) {
          console.error(`Download failed for ${item.key}:`, e);
        }
        setZipProgress(Math.round(((i + 1) / itemsToDownload.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buse-berkay-anilar-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
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
              Buse & Berkay Özel Arşiv Yönetimi
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
                autoFocus
                className="w-full text-center tracking-widest text-lg px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
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
            <span>Ana Sayfaya Dön</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      {/* Top Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20 px-4 py-3 sm:px-8 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="p-2 rounded-xl hover:bg-stone-100 text-stone-600 transition-colors"
              title="Ana Sayfaya Dön"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div>
              <h1 className="font-serif-luxury text-lg sm:text-xl font-bold text-stone-900">
                Buse & Berkay Anı Arşivi
              </h1>
              <p className="text-[11px] text-stone-500">Cloudflare R2 Yönetim Paneli</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchItems(pin)}
              disabled={loading || isDeleting}
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
                {isZipping
                  ? `İndiriliyor (%${zipProgress})`
                  : selectedKeys.size > 0
                  ? `Seçilenleri İndir (${selectedKeys.size})`
                  : 'Tümünü ZIP İndir'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 sm:px-8 space-y-6">
        {/* Notice alert */}
        {deleteNotice && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 animate-fadeIn">
            <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{deleteNotice}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Fotoğraf</p>
              <p className="text-lg font-bold text-stone-800">{photoCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Video</p>
              <p className="text-lg font-bold text-stone-800">{videoCount}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Toplam Boyut</p>
              <p className="text-lg font-bold text-stone-800">{totalMb} MB</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-stone-500">Depolama</p>
              <p className="text-sm font-bold text-stone-800">Cloudflare R2</p>
            </div>
          </div>
        </div>

        {/* Toolbar for Selection & Bulk Actions */}
        {items.length > 0 && (
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleSelectAllToggle}
                className="px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {selectedKeys.size === items.length ? (
                  <>
                    <CheckSquare className="w-4 h-4 text-rose-600" />
                    <span>Seçimi Kaldır ({items.length})</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 text-stone-400" />
                    <span>Tümünü Seç ({items.length})</span>
                  </>
                )}
              </button>

              {selectedKeys.size > 0 && (
                <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg">
                  {selectedKeys.size} dosya seçildi
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Seçilenleri Sil */}
              {selectedKeys.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Seçilenleri Sil ({selectedKeys.size})</span>
                </button>
              )}

              {/* Tümünü Sil */}
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={isDeleting || items.length === 0}
                className="px-3.5 py-1.5 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                title="Tüm arşivi kalıcı olarak temizler"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span>Tümünü Sil</span>
              </button>
            </div>
          </div>
        )}

        {/* Gallery */}
        {items.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 shadow-xs">
            <h3 className="font-bold text-stone-800">Henüz Anı Yüklenmedi</h3>
            <p className="text-xs text-stone-500 mt-1">
              Davetliler fotoğraf ve video yükledikçe burada listelenecektir.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {items.map((item) => {
              const isSelected = selectedKeys.has(item.key);
              const fileName = item.key.replace(/^anilar\//, '');

              return (
                <div
                  key={item.key}
                  className={`group relative bg-white rounded-2xl overflow-hidden border shadow-xs flex flex-col transition-all cursor-pointer ${
                    isSelected
                      ? 'border-rose-500 ring-2 ring-rose-500/50'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                  onClick={() => setPreviewItem(item)}
                >
                  {/* Select Checkbox (top-left) */}
                  <div
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => toggleSelectKey(item.key, e)}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all shadow-md ${
                        isSelected
                          ? 'bg-rose-600 text-white'
                          : 'bg-black/40 text-white hover:bg-black/60'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 opacity-70" />
                      )}
                    </div>
                  </div>

                  {/* Individual Delete Button (top-right) */}
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSingle(item.key, e)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white shadow-md transition-colors"
                      title="Bu dosyayı sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Media Thumbnail */}
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
                        <div className="relative z-10 w-11 h-11 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Play className="w-5 h-5 fill-white ml-0.5" />
                        </div>
                        <span className="relative z-10 text-[9px] text-stone-200 mt-2 font-medium bg-black/60 px-2 py-0.5 rounded-full">
                          Video
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
                  </div>

                  {/* Meta Details */}
                  <div className="p-3 bg-white space-y-1">
                    <p className="text-[11px] font-semibold text-stone-800 truncate" title={fileName}>
                      {fileName}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-stone-400">
                      <span>{formatFileSize(item.size)}</span>
                      <span>
                        {item.lastModified
                          ? new Date(item.lastModified).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Preview */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Controls */}
            <div className="w-full flex items-center justify-between text-white mb-3">
              <p className="text-xs sm:text-sm font-medium truncate max-w-xs sm:max-w-md">
                {previewItem.key.replace(/^anilar\//, '')} ({formatFileSize(previewItem.size)})
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={previewItem.url}
                  download={previewItem.key.replace(/^anilar\//, '')}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="İndir"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => handleDeleteSingle(previewItem.key)}
                  className="p-2 rounded-full bg-red-600/80 hover:bg-red-600 text-white transition-colors"
                  title="Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="Kapat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Media Content */}
            <div className="relative max-w-full max-h-[80vh] flex items-center justify-center rounded-2xl overflow-hidden bg-stone-950">
              {previewItem.type === 'video' ? (
                <video
                  src={previewItem.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-[80vh] rounded-xl"
                />
              ) : (
                <img
                  src={previewItem.url}
                  alt="Büyük Görünüm"
                  className="max-w-full max-h-[80vh] object-contain rounded-xl"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
