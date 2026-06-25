import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="px-6 py-4 flex justify-between items-center bg-white border-b">
        <div className="text-xl font-bold text-green-600">Pickleball Admin</div>
        <nav className="flex gap-4">
          <Link href="/login">
            <Button variant="ghost">Login</Button>
          </Link>
          <Link href="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 space-y-6">
        <div className="max-w-3xl space-y-4">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900">
            Next-Gen Pickleball <br className="hidden md:block" /> Court Management
          </h1>
          <p className="text-xl text-gray-600">
            A comprehensive, commercial-grade facility portal designed to integrate seamlessly with RFID court terminals.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-8">
          <Link href="/login">
            <Button size="lg" className="px-8 bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">
              Staff Login
            </Button>
          </Link>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Pickleball Court Management System. All rights reserved.
      </footer>
    </div>
  );
}
