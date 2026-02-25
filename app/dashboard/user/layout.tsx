'use client';

import React from 'react';
import UserSidebar from '@/components/sidebar/UserSidebar';
import UserNavbar from '@/components/UserNavbar';
import { PageTransition } from '@/components/ui/page-transition';

interface UserLayoutProps {
  children: React.ReactNode;
}

export default function UserLayout({ children }: UserLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-100/50 flex">
      {/* Sidebar */}
      <UserSidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header spacing */}
        <div className="lg:hidden h-14" />

        {/* Navbar */}
        <UserNavbar />

        {/* Content */}
        <div className="flex-1 p-4 lg:p-6">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
