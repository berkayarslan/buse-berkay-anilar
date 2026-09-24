# Buse & Berkay Anı Yükleme (Next.js + Cloudflare R2 + Vercel)

Bu proje, **Buse & Berkay**'ın düğün/nişan davetlilerinin masadaki QR kodu tarayarak yalnızca izin onayı verip fotoğraf ve video yükleyebileceği, **tek yönlü (drop-box)** bir dijital anı kutusudur.

Davetliler yükledikten sonra içerikleri göremez, silemez veya başkalarının fotoğraflarını listeleyemez. Yüklenen tüm medya dosyaları doğrudan çiftin **Cloudflare R2** bucket'ında toplanır.

---

## 🚀 1. GitHub Reponuza Pushlama (github.com/berkayarslan)

Terminalinizi açıp `nextjs-buse-berkay-r2` klasörüne girin ve aşağıdaki komutları çalıştırın:

```bash
cd nextjs-buse-berkay-r2
git init
git add .
git commit -m "Buse & Berkay Dugun Ani Yukleme Platformu"
git branch -M main
git remote add origin https://github.com/berkayarslan/buse-berkay-anilar.git
git push -u origin main
```

*(Eğer `buse-berkay-anilar` adında bir repo henüz yoksa GitHub'da oluşturup bu adımla pushlayabilirsiniz).*

---

## ☁️ 2. Cloudflare R2 Bucket Oluşturma (2 Dakika)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)'a giriş yapın.
2. Sol menüden **R2** seçeneğine tıklayın.
3. **Create bucket** butonuna tıklayın ve isim olarak `buse-berkay-anilar` girin.
4. Sağ taraftaki **Manage R2 API Tokens** kısmına tıklayıp **Create API token** deyin:
   - Permissions: **Object Read & Write** seçin.
   - TTL: Dilediğiniz süreyi seçin (örneğin 1 yıl veya Forever).
   - Size verilen **Access Key ID** ve **Secret Access Key** değerlerini kopyalayın.
5. Account ID değerinizi de R2 sayfasının sağ panelinden kopyalayın.

---

## ▲ 3. Vercel'e Tek Tıkla Deploy

1. [Vercel Dashboard](https://vercel.com/new)'a gidin.
2. `github.com/berkayarslan/buse-berkay-anilar` reposunu seçip **Import** deyin.
3. **Environment Variables** bölümüne şu 5 değişkeni ekleyin:

| Değişken Adı | Açıklama | Örnek Değer |
|---|---|---|
| `R2_ACCOUNT_ID` | Cloudflare Hesap ID | `9a7b6c5d4e3f...` |
| `R2_ACCESS_KEY_ID` | R2 Token Access Key ID | `5f2b8...` |
| `R2_SECRET_ACCESS_KEY` | R2 Token Secret Access Key | `c87e4...` |
| `R2_BUCKET_NAME` | R2 Kova Adı | `buse-berkay-anilar` |
| `ADMIN_PIN` | Berkay & Buse Yönetici Şifresi | `1810` |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | *(Opsiyonel)* R2 Public Domain | `https://pub-xxxx.r2.dev` |

4. **Deploy** butonuna basın! Siteniz birkaç saniyede canlıya alınır (Örn: `buse-berkay.vercel.app`).

---

## 📱 4. Masa QR Kodları & Kullanım

- **Davetliler İçin:** Masalardaki QR kodu tarattıklarında `https://buse-berkay.vercel.app` (veya `?table=5`) açılır.
  - Sadece izin kutucuğunu işaretler, fotoğraf/video seçip "Anıyı Gönder"e basarlar.
  - Yükleme sonrası "Teşekkürler, anınız Buse & Berkay'a ulaştı" ekranı gelir. Başka bir şey göremezler.
- **Buse & Berkay İçin:** `https://buse-berkay.vercel.app/admin` adresine gidip PIN kodunuzu (`1810`) girerek tüm fotoğrafları görebilir, **"Tümünü ZIP İndir"** butonuyla tek tıkla arşivinizi bilgisayarınıza indirebilirsiniz.
