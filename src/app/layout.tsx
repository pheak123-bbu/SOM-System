import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOM — ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាទិញតាមបណ្ដាញសង្គម",
  description: "ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាទិញ អតិថិជន និងការសន្ទនាសម្រាប់អ្នកលក់តាមបណ្ដាញសង្គម។",
  icons: {
    icon: "/som-mark.png",
    shortcut: "/som-mark.png",
    apple: "/som-mark.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="km">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&family=Kantumruy+Pro:ital,wght@0,300..700;1,300..700&family=Koulen&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
