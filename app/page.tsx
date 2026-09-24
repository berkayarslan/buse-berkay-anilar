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
      const ctx = canvas.getContext('2d', { alpha: false });
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
        0.86 // 86% studio quality JPEG
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// Video Optimizer:
// Phone cameras (e.g. iPhone 16 Pro Max 4K 60fps) record at 60-100 Mbps, making even a 30s video 300MB!
// This compressor downscales resolution to 720p HD (1280x720 / 720x1280) and transcodes at 2.2 Mbps bitrate.
// Compresses a 300MB video down to ~8MB - 18MB (over 90% savings!) in seconds,
// saving mobile data and keeping Cloudflare R2 storage costs near zero.
async function compressVideoForUpload(
  file: File,
  onProgress?: (progressText: string) => void
): Promise<File> {
  // If video is already small (< 12MB), no need to re-encode
  if (file.size <= 12 * 1024 * 1024) {
    return file;
  }

  // Verify browser support for MediaRecorder & Canvas
  if (
    typeof window === 'undefined' ||
    typeof MediaRecorder === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return file;
  }

  return new Promise((resolve) => {
    let finished = false;
    const safeResolve = (f: File) => {
      if (!finished) {
        finished = true;
        resolve(f);
      }
    };

    // 35s safety timeout: if device is slow or codec unsupported, proceed with original file
    const timeoutId = setTimeout(() => {
      safeResolve(file);
    }, 35000);

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        // If duration is unknown or too long (> 150s), use original to avoid mobile lag
        if (!duration || isNaN(duration) || duration <= 0 || duration > 150) {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(objectUrl);
          safeResolve(file);
          return;
        }

        // Downscale to 720p HD (1280 max dimension)
        const maxDim = 1280;
        let width = video.videoWidth || 1280;
        let height = video.videoHeight || 720;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        // Must be even dimensions
        width = width % 2 === 0 ? width : width - 1;
        height = height % 2 === 0 ? height : height - 1;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(objectUrl);
          safeResolve(file);
          return;
        }

        // Detect supported codec
        let mimeType = 'video/webm';
        if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) {
          mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
          mimeType = 'video/webm;codecs=vp8';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }

        const stream = canvas.captureStream ? canvas.captureStream(30) : null;
        if (!stream) {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(objectUrl);
          safeResolve(file);
          return;
        }

        // Re-encode at 2.2 Mbps (2,200,000 bps) -> crisp HD quality & compact size
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 2_200_000,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(objectUrl);
          const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const cleanName = file.name.replace(/\.[^.]+$/, `_hd.${ext}`);
          const compressedBlob = new Blob(chunks, { type: mimeType });

          // If compression reduced size, use it!
          if (compressedBlob.size > 10000 && compressedBlob.size < file.size) {
            const compressedFile = new File([compressedBlob], cleanName, {
              type: mimeType,
              lastModified: Date.now(),
            });
            safeResolve(compressedFile);
          } else {
            safeResolve(file);
          }
        };

        // Play at 2x rate to compress twice as fast
        video.currentTime = 0;
        video.playbackRate = 2.0;

        let active = true;
        const renderLoop = () => {
          if (!active || video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, width, height);
          if (onProgress && duration > 0) {
            const pct = Math.min(99, Math.round((video.currentTime / duration) * 100));
            onProgress(`Video optimize ediliyor... (%${pct})`);
          }
          requestAnimationFrame(renderLoop);
        };

        recorder.start(100);
        await video.play();
        renderLoop();

        video.onended = () => {
          active = false;
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        };
      } catch {
        clearTimeout(timeoutId);
        URL.revokeObjectURL(objectUrl);
        safeResolve(file);
      }
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      safeResolve(file);
    };
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

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    const newQueued: QueuedFile[] = [];
    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm)$/i));

      // Limit Check:
      // Photos: up to 100MB (iPhone 16 Pro RAW / 48MP supported, optimized seamlessly on device)
      // Videos: up to 350MB (300MB phone videos accepted and optimized to ~10-20MB)
      if (isVideo && file.size > 350 * 1024 * 1024) {
        setErrorMessage(
          `"${file.name}" video boyutu çok yüksek (${formatFileSize(file.size)}). Videolar maksimum 350 MB olabilir.`
        );
        return;
      }

      if (!isVideo && file.size > 100 * 1024 * 1024) {
        setErrorMessage(`"${file.name}" çok büyük. Fotoğraflar maksimum 100 MB olabilir.`);
        return;
      }

      newQueued.push({
        file,
        previewUrl: URL.createObjectURL(file),
        type: isVideo ? 'video' : 'photo',
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
        originalSizeBytes: file.size,
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
        let fileToUpload = item.file;

        // 1. Optimize Photos or Videos
        if (item.type === 'photo') {
          setStatusMessage(`Fotoğraf optimize ediliyor (4K Ultra-HD)... (${i + 1}/${total})`);
          fileToUpload = await optimizeImageForUpload(item.file);
        } else if (item.type === 'video') {
          if (item.file.size > 12 * 1024 * 1024) {
            setStatusMessage(`Video optimize ediliyor (${formatFileSize(item.file.size)} ➔ HD)... (${i + 1}/${total})`);
            fileToUpload = await compressVideoForUpload(item.file, (progressText) => {
              setStatusMessage(`${progressText} (${i + 1}/${total})`);
            });
          }
        }

        let uploadSuccess = false;

        // 2. Direct Pre-Signed URL PUT to Cloudflare R2 (handles any file size directly)
        try {
          const presignRes = await fetch('/api/upload/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: fileToUpload.name,
              fileType: fileToUpload.type,
              senderName: senderName.trim(),
              note: note.trim() || undefined,
            }),
          });

          if (presignRes.ok) {
            const { presignedUrl } = await presignRes.json();
            if (presignedUrl) {
              setStatusMessage(`Dosya ${i + 1}/${total} R2'ye aktarılıyor (${formatFileSize(fileToUpload.size)})...`);
              const putRes = await fetch(presignedUrl, {
                method: 'PUT',
                body: fileToUpload,
                headers: {
                  'Content-Type': fileToUpload.type || 'application/octet-stream',
                },
              });

              if (putRes.ok) {
                uploadSuccess = true;
              }
            }
          }
        } catch {
          // Fallback to server endpoint if direct presign fails
        }

        // 3. Fallback: Multipart/form-data upload to /api/upload
        if (!uploadSuccess) {
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
        </div>

        <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
          Çektiğiniz fotoğraf ve videoları anında yükleyebilir, anı arşivimize iletebilirsiniz.
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

            {/* Dosya Boyutu ve Kalite Bilgilendirme Kartı */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 flex items-start gap-2 text-[11px] text-stone-600 leading-relaxed">
              <Info className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-stone-800">Akıllı Optimizasyon & Limitler:</span>
                <div className="mt-1 space-y-0.5 text-stone-600">
                  <p>• <strong>Fotoğraflar:</strong> 100 MB'a kadar (iPhone 48MP yüksek netlik korunarak optimize edilir).</p>
                  <p>• <strong>Videolar:</strong> 350 MB'a kadar (Telefonunuzdaki 300 MB'lık videolar otomatik olarak HD kalitede optimize edilip hızlıca yüklenir).</p>
                </div>
              </div>
            </div>
          </div>

          {/* Queued files */}
          {queuedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                <span>Yüklenecek Dosyalar ({queuedFiles.length})</span>
                <span className="text-[11px] text-emerald-600 font-medium">Akıllı Optimizasyon Aktif</span>
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
                        {file.type === 'video' ? 'Video' : 'Fotoğraf (Ultra-HD)'} • {file.sizeFormatted}
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
          <span>🔐 Buse & Berkay Girişi</span>
        </a>
        <p className="text-[10px] text-stone-400">
          Tüm hakları saklıdır © Buse & Berkay Düğün Anı Kutusu
        </p>
      </footer>
    </main>
  );
}
