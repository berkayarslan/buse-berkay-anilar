'use client';

import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Camera,
  Upload,
  Heart,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  X,
  FileVideo,
  ArrowRight,
  AlertCircle,
  Plus,
} from 'lucide-react';

interface QueuedFile {
  file: File;
  previewUrl: string;
  type: 'photo' | 'video';
  name: string;
  sizeFormatted: string;
}

// Client-side image optimizer: Resizes huge mobile photos (e.g. 8MB 48MP) to crisp 2560px JPEG (~1MB)
// Ensures blazing fast uploads on mobile networks and avoids server payload size limits
async function optimizeImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2560; // 2.5K crisp resolution (ideal for high-end wedding album prints)
      let { width, height } = img;

      // If already small enough, keep as-is
      if (width <= maxDim && height <= maxDim && file.size < 2 * 1024 * 1024) {
        resolve(file);
        return;
      }

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const cleanName = file.name.replace(/\.[^.]+$/, '.jpg');
          const optimizedFile = new File([blob], cleanName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(optimizedFile);
        },
        'image/jpeg',
        0.88 // 88% high-fidelity JPEG compression
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export default function GuestUploadPage() {
  const [senderName, setSenderName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [note, setNote] = useState('');
  const [hasConsent, setHasConsent] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const table = params.get('table');
      if (table) setTableNumber(table);
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    const newQueued: QueuedFile[] = [];
    Array.from(files).forEach((file) => {
      if (file.size > 80 * 1024 * 1024) {
        setErrorMessage(`"${file.name}" çok büyük. Lütfen 80MB altı dosyalar seçiniz.`);
        return;
      }
      const isVideo = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm)$/i));
      newQueued.push({
        file,
        previewUrl: URL.createObjectURL(file),
        type: isVideo ? 'video' : 'photo',
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
      });
    });

    setQueuedFiles((prev) => [...prev, ...newQueued]);
  };

  const removeQueuedFile = (index: number) => {
    setQueuedFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hasConsent) {
      setErrorMessage('Lütfen fotoğraf ve video paylaşım iznini onaylayınız.');
      return;
    }

    if (queuedFiles.length === 0) {
      setErrorMessage('Lütfen en az bir fotoğraf veya video ekleyiniz.');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(5);
    setStatusMessage('Yükleme başlatılıyor...');

    try {
      const total = queuedFiles.length;

      for (let i = 0; i < total; i++) {
        const item = queuedFiles[i];
        setStatusMessage(`Dosya ${i + 1}/${total} hazırlanıyor...`);

        // 1. Client-side optimize (reduces 8MB raw JPEG to ~1MB crisp JPEG)
        const fileToUpload = await optimizeImageForUpload(item.file);

        let uploadSuccess = false;

        // 2. Try pre-signed URL direct PUT to R2 (bypasses Vercel limits completely)
        try {
          const presignRes = await fetch('/api/upload/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: fileToUpload.name,
              fileType: fileToUpload.type,
              senderName: senderName.trim(),
              tableNumber: tableNumber.trim() || undefined,
              note: note.trim() || undefined,
            }),
          });

          if (presignRes.ok) {
            const { presignedUrl } = await presignRes.json();
            if (presignedUrl) {
              setStatusMessage(`Dosya ${i + 1}/${total} R2'ye aktarılıyor...`);
              const putRes = await fetch(presignedUrl, {
                method: 'PUT',
                body: fileToUpload,
                headers: {
                  'Content-Type': fileToUpload.type || 'image/jpeg',
                },
              });

              if (putRes.ok) {
                uploadSuccess = true;
              }
            }
          }
        } catch {
          // If direct pre-signed fails (e.g. CORS block before R2 rule configured), fall back to FormData endpoint
        }

        // 3. Fallback: Fast multipart/form-data upload to /api/upload
        if (!uploadSuccess) {
          setStatusMessage(`Dosya ${i + 1}/${total} yükleniyor...`);
          const formData = new FormData();
          formData.append('file', fileToUpload);
          formData.append('senderName', senderName.trim());
          if (tableNumber.trim()) formData.append('tableNumber', tableNumber.trim());
          if (note.trim()) formData.append('note', note.trim());
          formData.append('mediaType', item.type);
          formData.append('hasConsent', 'true');

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Dosya ${i + 1} (${item.name}) yüklenemedi.`);
          }
        }

        const percent = Math.round(((i + 1) / total) * 100);
        setUploadProgress(percent);
      }

      setStatusMessage('Tamamlandı! 🎉');

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#e11d48', '#fb7185', '#fbbf24', '#f43f5e'],
      });

      setIsSuccess(true);
      queuedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      setQueuedFiles([]);
      setNote('');
    } catch (err: any) {
      console.error('Upload error:', err);
      setErrorMessage(err.message || 'Yükleme sırasında bir hata oluştu. Lütfen tekrar deneyiniz.');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
      setStatusMessage('');
    }
  };

  return (
    <main className="max-w-xl mx-auto px-4 py-8 sm:py-12">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Header */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-500 via-rose-600 to-amber-400 p-[2px] shadow-md shadow-rose-200/50">
          <div className="w-full h-full bg-white rounded-[22px] flex items-center justify-center">
            <span className="font-serif-luxury font-bold text-2xl text-stone-900 tracking-tight">
              B&B
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-center gap-1.5 text-stone-900">
            <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold tracking-wide">
              Buse & Berkay
            </h1>
            <Heart className="w-4 h-4 fill-rose-500 text-rose-500 animate-pulse" />
          </div>
          <p className="text-xs uppercase tracking-widest text-rose-700 font-semibold mt-1">
            Anı Yükleme Platformu
          </p>
        </div>

        <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
          Bizimle paylaştığınız her an çok değerli! Çektiğiniz fotoğraf ve videoları anında Buse & Berkay anı arşivimize iletebilirsiniz.
        </p>
      </div>

      {isSuccess ? (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-rose-100/60 border border-rose-100 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-rose-50 border-4 border-rose-100 flex items-center justify-center text-rose-600">
            <Heart className="w-10 h-10 fill-rose-600 text-rose-600" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Anınız Başarıyla İletildi</span>
            </div>

            <h2 className="font-serif-luxury text-2xl font-bold text-stone-900">
              Teşekkür Ederiz!
            </h2>

            <p className="text-xs sm:text-sm text-stone-600 max-w-sm mx-auto leading-relaxed">
              Fotoğraf ve videolarınız <strong className="text-stone-900">Buse & Berkay</strong>'ın Cloudflare R2 özel arşivine güvenle ulaştı.
            </p>
          </div>

          <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 text-left flex items-start gap-3 text-xs text-stone-600">
            <ShieldCheck className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-stone-800">Gizlilik Güvencesi</p>
              <p className="text-stone-500 mt-0.5 leading-relaxed">
                Yüklediğiniz içerikler tek yönlü olarak çiftin arşivine kaydedilmiştir. Güvenliğiniz için diğer davetliler tarafından görüntülenemez veya silinemez.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setIsSuccess(false);
              setErrorMessage(null);
            }}
            className="w-full py-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm shadow-md shadow-rose-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Bir Fotoğraf / Video Daha Yükle</span>
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl p-5 sm:p-7 shadow-xl shadow-rose-100/50 border border-stone-200/70 space-y-6"
        >
          {/* 1. Consent */}
          <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-4 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasConsent}
                onChange={(e) => {
                  setHasConsent(e.target.checked);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="mt-1 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-rose-300 cursor-pointer accent-rose-600"
              />
              <span className="text-xs sm:text-sm text-stone-800 font-medium leading-snug">
                Yüklediğim fotoğraf ve videoların Buse & Berkay'ın anı albümüne kaydedilmesine izin veriyorum.
                <span className="text-rose-600 font-bold ml-1">* (Zorunlu)</span>
              </span>
            </label>

            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 pl-7">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Yalnızca Buse & Berkay'ın Cloudflare R2 arşivine aktarılır.</span>
            </div>
          </div>

          {/* 2. Guest Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Adınız & Soyadınız <span className="text-stone-400 font-normal">(İsteğe bağlı)</span>
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Masa Numarası <span className="text-stone-400 font-normal">(İsteğe bağlı)</span>
              </label>
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Örn: 4"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* 3. Note */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Buse & Berkay'a Notunuz <span className="text-stone-400 font-normal">(İsteğe bağlı)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Bir ömür boyu mutluluklar dileriz..."
              className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all resize-none"
            />
          </div>

          {/* 4. Action Buttons */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-stone-700">
              Fotoğraf veya Video Ekleyin <span className="text-rose-600 font-bold">*</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="py-4 px-3 rounded-2xl border-2 border-dashed border-rose-300 hover:border-rose-500 bg-rose-50/50 hover:bg-rose-50 transition-all flex flex-col items-center justify-center gap-1.5 text-rose-700 cursor-pointer group active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Camera className="w-5 h-5 text-rose-600" />
                </div>
                <span className="text-xs font-bold">Kamera ile Çek</span>
                <span className="text-[10px] text-stone-500">Fotoğraf & Video</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-4 px-3 rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-500 bg-stone-50 hover:bg-stone-100 transition-all flex flex-col items-center justify-center gap-1.5 text-stone-700 cursor-pointer group active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5 text-stone-700" />
                </div>
                <span className="text-xs font-bold">Galeriden Seç</span>
                <span className="text-[10px] text-stone-500">Çoklu Dosya</span>
              </button>
            </div>
          </div>

          {/* Queued files */}
          {queuedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                <span>Yüklenecek Dosyalar ({queuedFiles.length})</span>
                <span className="text-[11px] text-emerald-600 font-medium">Otomatik yüksek kalite optimizasyonu aktif</span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {queuedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-stone-50 border border-stone-200/80"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-stone-200 flex items-center justify-center shrink-0">
                      {file.type === 'photo' ? (
                        <img src={file.previewUrl} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <FileVideo className="w-5 h-5 text-stone-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-stone-400">
                        {file.type === 'video' ? 'Video' : 'Fotoğraf'} • {file.sizeFormatted}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => removeQueuedFile(idx)}
                      className="p-1 rounded-lg hover:bg-stone-200 text-stone-400 hover:text-stone-700 cursor-pointer disabled:opacity-40"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || queuedFiles.length === 0}
              className={`w-full py-3.5 px-6 rounded-2xl font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isSubmitting || queuedFiles.length === 0
                  ? 'bg-stone-300 text-stone-500 cursor-not-allowed shadow-none'
                  : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25 active:scale-[0.98]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>
                    {statusMessage || `Yükleniyor... (${uploadProgress}%)`}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>
                    {queuedFiles.length > 0
                      ? `${queuedFiles.length} Anıyı Buse & Berkay'a Gönder`
                      : 'Anıyı Gönder'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Footer */}
      <footer className="mt-8 text-center space-y-2">
        <a
          href="/admin"
          className="text-[11px] text-stone-400 hover:text-stone-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
        >
          <span>🔐 Buse & Berkay Yönetici Girişi</span>
        </a>
        <p className="text-[10px] text-stone-400">
          Tüm hakları saklıdır © Buse & Berkay Düğün Anı Kutusu
        </p>
      </footer>
    </main>
  );
}
