import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hickoku Admin",
  description: "Admin panel for the Hickoku perfume storefront — orders, payments, shipments & site content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
