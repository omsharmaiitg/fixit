import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocationProvider } from "@/contexts/LocationContext";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
// Humanist display face for headings (§7) — civic-confident, one strong face.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});
export const metadata: Metadata = {
  title: "FixIt — Report. Verify. Resolve.",
  description:
    "Hyperlocal civic-issue platform. Report, verify, track, and resolve local infrastructure issues with AI-assisted triage and radical public transparency.",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ZT4FTXS3PW"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ZT4FTXS3PW');
          `}
        </Script>
        <AuthProvider>
          <LocationProvider>{children}</LocationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
