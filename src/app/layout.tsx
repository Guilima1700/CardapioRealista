import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cardápio · Uma nova experiência à mesa.",
  description:
    "Descubra o cardápio, personalize seu burger e acompanhe seu pedido. Uma nova experiência à mesa.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
