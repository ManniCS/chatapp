import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChatApp - Document Chat Platform',
  description: 'Chat with your business documents using AI',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
