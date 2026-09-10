import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "İstanbul'dan Ucuz Uçuşlar",
  description: "İstanbul (IST/SAW) çıkışlı ucuz uçuş fiyatı keşif uygulaması"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
        />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
