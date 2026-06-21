import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "../globals.css";
import { Sidebar } from "@/components/sidebar";
import { auth } from "@/lib/auth";
import AuthProvider from "../auth-provider";

export const metadata: Metadata = {
  title: "Investition - 投资记录",
  description: "记录投资组合、追踪资产增值与回撤",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <AuthProvider>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-h-screen">
          <div className="p-8">{children}</div>
        </main>
      </div>
    </AuthProvider>
  );
}
