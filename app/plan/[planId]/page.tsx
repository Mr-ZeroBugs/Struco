'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/app/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import MindMapCanvas from '@/app/components/MindMapCanvas';
import PlanSidebar from '@/app/components/PlanSidebarTEMP'; // Make sure 'P' and 'S' are capitalized
import { Menu } from 'lucide-react';

export default function PlanDetailPage() {
  const [user, setUser] = useState<User | null>(null);
  const [planTitle, setPlanTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const planId = pathname.split('/').pop() || null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (planId) {
          const planRef = doc(db, 'users', currentUser.uid, 'plans', planId);
          const docSnap = await getDoc(planRef);
          if (docSnap.exists()) {
            setPlanTitle(docSnap.data().title);
          } else {
            console.error("Plan not found!");
            router.push('/');
          }
        }
      } else {
        router.push('/');
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [planId, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">
        Loading your masterpiece...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex overflow-hidden">
      <PlanSidebar user={user} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="flex-1 flex flex-col w-full h-full">
        {/* Header bar */}
        <header className="flex-shrink-0 flex items-center gap-4 p-4 bg-gray-800/50 border-b border-gray-700">
          {/* Hamburger Menu Button for Mobile */}
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden" aria-label="Open sidebar">
            <Menu size={24} />
          </button>
          <h1 className="text-xl font-semibold truncate">
            {planTitle}
          </h1>
        </header>
        
        {/* Canvas Area */}
        <div className="flex-1 w-full h-full">
            <MindMapCanvas user={user} planId={planId} />
        </div>
      </main>
    </div>
  );
}