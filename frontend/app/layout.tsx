
export const metadata = {
  title: "Polymarket Bot Dashboard",
  description: "Start/stop markets, edit params, and monitor PnL",
};

import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-5xl mx-auto p-6">
          <h1 className="text-2xl font-semibold mb-4">Polymarket Bot Dashboard</h1>
          {children}
        </div>
      </body>
    </html>
  );
}
