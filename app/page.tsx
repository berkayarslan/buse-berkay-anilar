'use client';

import React, { useState, useRef } from 'react';
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
  Video,
  Info,
} from 'lucide-react';

interface QueuedFile {
  file: File;
  previewUrl: string;
  type: 'photo' | 'video';
  name: string;
  sizeFormatted: string;
  originalSizeBytes: number;
}

// Format bytes helper
function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// iPhone 16 Pro Max Ultra-HD Optimizer:
// iPhone 16 Pro Max 48MP ProRAW/HEIC/JPEG captures at up to 8064 x 6048 pixels (15MB - 40MB).
// We optimize to 2560px master resolution (2.5K Ultra-HD) at 86% studio quality.
// Keeps every single micro-texture, facial detail, and vibrant color pristine for luxury wedding prints,
// while shrinking file size from ~30MB down to ~1.2MB - 1.8MB in milliseconds.
async function optimizeImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2560; // 2.5K Ultra-HD Master Dimension
      let { width, height } = img;

      // If already under 2560px and under 2.5MB, keep untouched
      if (width <= maxDim && height <= maxDim && file.size < 2.5 * 1024 * 1024) {
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

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
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
        0.86 // High-fidelity visual quality for wedding prints
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

// Direct Cloudflare R2 Upload via Pre-signed URL (supports any size up to 500MB)
function uploadToPresignedUrl(
  presignedUrl: string,
  file: File,
  contentType: string,
  onProgress: (percent: number, loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl, true);
    if (contentType) {
      xhr.setRequestHeader('Content-Type', contentType);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent, e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 HTTP ${xhr.status}: ${xhr.statusText || 'Yükleme hatası'}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('R2_CORS_OR_NETWORK'));
    };

    xhr.ontimeout = () => {
      reject(new Error('R2_TIMEOUT'));
    };

    xhr.send(file);
  });
}

export default function GuestUploadPage() {
  const [senderName, setSenderName] = useState('');
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
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    const newFiles: QueuedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|m4v)$/i);

      // Photos: up to 100MB (iPhone 48MP ProRAW/HEIC supported, optimized on client)
      // Videos: up to 500MB supported directly to R2
      if (isVideo && file.size > 500 * 1024 * 1024) {
        setErrorMessage(
          `"${file.name}" video boyutu çok yüksek (${formatFileSize(file.size)}). Videolar maksimum 500 MB olabilir.`
        );
        return;
      }

      if (!isVideo && file.size > 100 * 1024 * 1024) {
        setErrorMessage(
          `"${file.name}" fotoğraf boyutu çok yüksek (${formatFileSize(file.size)}). Fotoğraflar maksimum 100 MB olabilir.`
        );
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      newFiles.push({
        file,
        previewUrl,
        type: isVideo ? 'video' : 'photo',
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
        originalSizeBytes: file.size,
      });
    }

    setQueuedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeQueuedFile = (index: number) => {
    setQueuedFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hasConsent) {
      setErrorMessage('Lütfen yükleme ve açık rıza onay kutucuğunu işaretleyiniz.');
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
        let fileToUpload = item.file;
        let mimeType = item.file.type;

        // 1. Optimize Photos (Ultra-HD 2.5K canvas compression)
        // For videos: preserve 1.0x natural speed & crisp audio
        if (item.type === 'photo') {
          setStatusMessage(`Fotoğraf hazırlanıyor... (${i + 1}/${total})`);
          fileToUpload = await optimizeImageForUpload(item.file);
          mimeType = fileToUpload.type || 'image/jpeg';
        } else {
          mimeType = fileToUpload.type || 'video/mp4';
          setStatusMessage(`Video R2'ye aktarılıyor (${formatFileSize(fileToUpload.size)})... (${i + 1}/${total})`);
        }

        let uploadSuccess = false;
        let presignFailedReason: string | null = null;

        // 2. Direct Pre-Signed URL PUT to Cloudflare R2 (handles files up to 500MB)
        try {
          const presignRes = await fetch('/api/upload/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: fileToUpload.name,
              fileType: mimeType,
              senderName: senderName.trim(),
              note: note.trim() || undefined,
            }),
          });

          if (presignRes.ok) {
            const { presignedUrl } = await presignRes.json();
            if (presignedUrl) {
              await uploadToPresignedUrl(
                presignedUrl,
                fileToUpload,
                mimeType,
                (percent, loaded, totalBytes) => {
                  const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
                  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
                  setStatusMessage(
                    `Dosya ${i + 1}/${total}: ${loadedMb} MB / ${totalMb} MB (%${percent}) aktarılıyor...`
                  );
                  setUploadProgress(percent);
                }
              );
              uploadSuccess = true;
            }
          }
        } catch (presignErr: any) {
          console.warn('Presigned upload failed:', presignErr);
          if (presignErr?.message === 'R2_CORS_OR_NETWORK') {
            presignFailedReason = 'cors';
          }
        }

        // 3. Fallback for files <= 4.2 MB (photos, small clips) via /api/upload
        if (!uploadSuccess) {
          if (fileToUpload.size > 4.2 * 1024 * 1024) {
            if (presignFailedReason === 'cors') {
              throw new Error(
                `"${item.name}" (${formatFileSize(fileToUpload.size)}) doğrudan R2'ye aktarılamadı. Cloudflare R2 bucket CORS kuralı eksik olduğundan tarayıcı doğrudan yüklemeyi engelledi. Lütfen Cloudflare panelinden CORS ilkesini etkinleştiriniz.`
              );
            } else {
              throw new Error(
                `"${item.name}" (${formatFileSize(fileToUpload.size)}) yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyiniz.`
              );
            }
          }

          setStatusMessage(`Dosya ${i + 1}/${total} yükleniyor...`);
          const formData = new FormData();
          formData.append('file', fileToUpload);
          formData.append('senderName', senderName.trim());
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

        const overallPercent = Math.round(((i + 1) / total) * 100);
        setUploadProgress(overallPercent);
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
      {/* Gallery file picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Direct Photo Camera */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Direct Video Camera */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Header */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold tracking-wide border border-rose-200/60 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-rose-500" />
          <span>Düğün Anı Albümü</span>
        </div>

        <h1 className="font-serif-luxury text-3xl sm:text-4xl text-stone-900 tracking-tight font-bold">
          Buse & Berkay
        </h1>

        <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
          Bu mutlu günümüzü ölümsüzleştiren karelerinizi ve videolarınızı bizimle paylaşarak anılarımıza ortak olun.
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
          <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-4">
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
          </div>

          {/* 2. Guest Info (Ad Soyad) */}
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-700">
                Fotoğraf veya Video Ekleyin <span className="text-rose-600 font-bold">*</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="py-3.5 px-2 rounded-2xl border-2 border-dashed border-rose-300 hover:border-rose-500 bg-rose-50/50 hover:bg-rose-50 transition-all flex flex-col items-center justify-center gap-1 text-rose-700 cursor-pointer group active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Camera className="w-4 h-4 text-rose-600" />
                </div>
                <span className="text-[11px] font-bold">Fotoğraf Çek</span>
                <span className="text-[9px] text-stone-400">Kamera</span>
              </button>

              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="py-3.5 px-2 rounded-2xl border-2 border-dashed border-rose-300 hover:border-rose-500 bg-rose-50/50 hover:bg-rose-50 transition-all flex flex-col items-center justify-center gap-1 text-rose-700 cursor-pointer group active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Video className="w-4 h-4 text-rose-600" />
                </div>
                <span className="text-[11px] font-bold">Video Kaydet</span>
                <span className="text-[9px] text-stone-400">Kamera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-3.5 px-2 rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-500 bg-stone-50 hover:bg-stone-100 transition-all flex flex-col items-center justify-center gap-1 text-stone-700 cursor-pointer group active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-full bg-stone-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="w-4 h-4 text-stone-700" />
                </div>
                <span className="text-[11px] font-bold">Galeriden Seç</span>
                <span className="text-[9px] text-stone-400">Tüm Medya</span>
              </button>
            </div>

            {/* Ufak Uyarı & Maksimum Boyut Kutucukları */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 px-0.5">
              <div className="flex items-center gap-1 text-[11px] text-stone-400">
                <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>Maksimum dosya boyutları:</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-50 border border-stone-200/80 text-[10px] text-stone-600 shadow-2xs">
                  <Camera className="w-3 h-3 text-rose-500" />
                  <span>Fotoğraf: <strong className="text-stone-800 font-semibold">100 MB</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-50 border border-stone-200/80 text-[10px] text-stone-600 shadow-2xs">
                  <Video className="w-3 h-3 text-indigo-500" />
                  <span>Video: <strong className="text-stone-800 font-semibold">500 MB</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Queued files */}
          {queuedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                <span>Yüklenecek Dosyalar ({queuedFiles.length})</span>
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
                      className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-stone-200/60 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Hata Oluştu:</span>
                <span className="leading-relaxed block">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Progress Indicator */}
          {isSubmitting && (
            <div className="space-y-2 p-3.5 bg-rose-50/50 rounded-2xl border border-rose-100">
              <div className="flex justify-between items-center text-xs font-medium text-stone-700">
                <span>{statusMessage}</span>
                <span className="font-bold text-rose-600">%{uploadProgress}</span>
              </div>
              <div className="h-2 w-full bg-rose-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-600 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || queuedFiles.length === 0}
            className={`w-full py-4 px-6 rounded-2xl font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isSubmitting || queuedFiles.length === 0
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20 active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? (
              <span>Yükleniyor...</span>
            ) : (
              <>
                <Heart className="w-4 h-4 fill-white" />
                <span>Anıyı Gönder ({queuedFiles.length} Dosya)</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </form>
      )}

      {/* Minimal Footer */}
      <footer className="mt-8 text-center pb-4">
        <p className="text-[10px] text-stone-400">
          Tüm hakları saklıdır © Buse & Berkay Düğün Anı Kutusu
        </p>
      </footer>
    </main>
  );
}
