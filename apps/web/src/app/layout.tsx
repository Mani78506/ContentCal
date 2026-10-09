import type { Metadata } from "next";

import "./globals.css";

import { AppProvider } from "@/lib/app-context";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "ContentCal", template: "%s · ContentCal" },
  description: "Plan, create, schedule and publish social content from one calm workspace.",
};

const themeInit = `(function(){try{var t=localStorage.getItem("contentcal.theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <ThemeProvider>
          <AppProvider>
            <ToastProvider>{children}</ToastProvider>
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
