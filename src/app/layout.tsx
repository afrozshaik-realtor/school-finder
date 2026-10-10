import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SchoolFinder Alberta",
  description:
    "School designation and transportation research for Calgary and Airdrie, Alberta.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
