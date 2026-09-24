import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Buse & Berkay Anı Yükleme',
  description: 'Buse & Berkay düğün ve nişan anı yükleme platformu. Davetlilerin fotoğraf ve video yükleyebileceği tek yönlü güvenli anı kutusu.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-stone-50 text-stone-800 antialiased selection:bg-rose-200 selection:text-rose-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
