import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Opportunity Compass — Find your next possibility",
  description:
    "A personal space to discover opportunities, explore new interests, and take the next step.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
