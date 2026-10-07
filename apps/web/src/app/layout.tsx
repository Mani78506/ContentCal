import type { Metadata } from "next";

import "./globals.css";

import { AppProvider } from "@/lib/app-context";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "ContentCal", template: "%s · ContentCal" },
  description: "Plan, create, schedule and publish social content from one calm workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
