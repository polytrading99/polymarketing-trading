export const metadata = {
  title: "Polymarket Bot Dashboard",
  description: "Start/stop markets, edit params, and monitor PnL",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-shell">
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ padding: "16px 16px 0" }}>
            <h1 style={{ fontSize: 22, fontWeight: 600 }}>Polymarket Bot Dashboard</h1>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
