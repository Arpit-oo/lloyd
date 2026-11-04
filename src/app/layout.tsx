import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import { SCENE_SCHEMES } from "@/lib/client/wallpapers";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ variable: "--font-app-sans", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-app-serif", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-app-mono", subsets: ["latin"] });
// The Magi style's grotesk (the closest open match to the product's UI type).
const magiSans = Inter({ variable: "--font-magi-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lloyd",
  description: "Lloyd plans and writes campaigns that follow your brand's rules.",
};

/** Applies the saved theme (and a wallpaper's scheme) before first paint, so nothing flashes. */
const THEME_SCRIPT = `(function(){try{var s=${JSON.stringify(SCENE_SCHEMES)};var w=localStorage.getItem("wallpaper");var t=localStorage.getItem("theme")||"system";var d=w&&s[w]?s[w]==="dark":t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.classList.toggle("magi",(localStorage.getItem("style")||"magi")==="magi");if(w&&s[w])r.classList.add("wall")}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable} ${magiSans.variable} magi h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
