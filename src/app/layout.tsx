import type { Metadata } from "next";
import { Roboto, Roboto_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

// PlusPlus design system: Work Sans = display/buttons, Roboto = body/UI.
// Roboto Mono carries the tabular numerals (no mono in the brand spec;
// staying in the Roboto family). Poppins is legacy-templates-only — unused.
const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "PlusPlus · Pipeline Scoreboard",
  description: "Stage-entry throughput vs. goals — the stable view of the New Accounts pipeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${workSans.variable} ${roboto.variable} ${robotoMono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
