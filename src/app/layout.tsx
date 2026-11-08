import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Spectral } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-spectral",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Edge-to-edge so env(safe-area-inset-*) works under the notch/home bar…
  viewportFit: "cover",
  // …and shrink the layout viewport (not just the visual one) when the
  // on-screen keyboard opens, keeping the composer above it.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "AI governance",
    "federal AI readiness",
    "agentic AI oversight",
    "policy compliance",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="pine"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      // Font variables live on <html>: the theme's --font-* tokens resolve
      // at :root, so on <body> they'd be undefined there and every face
      // would fall back to the system font.
      className={`${geist.variable} ${spectral.variable} ${jetbrains.variable}`}
    >
      <head>
        {/* Set the persisted theme before first paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('prism-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
