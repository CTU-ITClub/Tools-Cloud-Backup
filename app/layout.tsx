import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IT Club Media Cloud',
  description: 'Lưu trữ và quản lý ảnh sự kiện dành cho IT Club',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
