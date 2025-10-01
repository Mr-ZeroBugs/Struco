'use client';

import Link from 'next/link';
import { User } from 'firebase/auth';
import { ArrowLeft, UserCircle, X } from 'lucide-react';

interface PlanSidebarProps {
  user: User | null;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function PlanSidebar({ user, isOpen, setIsOpen }: PlanSidebarProps) {
  return (
    <>
      {/* Backdrop for mobile (dimmed background) */}
      <div 
        onClick={() => setIsOpen(false)} 
        className={`fixed inset-0 z-20 bg-black/50 transition-opacity md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`} 
      />
      
      {/* Sidebar Content */}
      <div 
        className={`fixed top-0 left-0 z-30 flex h-full w-64 flex-col bg-gray-800 text-white shadow-lg transition-transform duration-300 ease-in-out 
                   md:relative md:translate-x-0 ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                   }`}
      >
        {/* Header with Close Button for Mobile */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <span className="text-2xl font-bold">Struco</span>
          <button onClick={() => setIsOpen(false)} className="md:hidden">
            <X size={24} />
          </button>
        </div>
        
        <nav className="flex-1 p-2">
          <Link 
            href="/" 
            className="flex w-full items-center rounded-lg p-3 text-left transition-colors hover:bg-gray-700"
          >
            <ArrowLeft className="mr-3 h-5 w-5" />
            กลับไปหน้า Dashboard
          </Link>
        </nav>
        
        <div className="p-2 border-t border-gray-700">
          <div className="flex items-center p-3">
            {user?.photoURL ? 
              <img src={user.photoURL} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full mr-3" />
              : <UserCircle className="w-8 h-8 rounded-full mr-3"/>
            }
            <span className="truncate">{user?.displayName}</span>
          </div>
        </div>
      </div>
    </>
  );
}
