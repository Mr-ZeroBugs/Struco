'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase/config';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { BrainCircuit, Menu } from 'lucide-react';

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Authentication error:", error);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          Initializing...
        </div>
      );
    }

    if (!user) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-center p-4">
          <BrainCircuit size={48} className="text-blue-400 mb-4"/>
          <h2 className="text-2xl font-bold">Welcome to Struco</h2>
          <p className="mt-2 max-w-md text-gray-400">Please log in to start managing your life map.</p>
        </div>
      );
    }
    
    return <Dashboard user={user} />;
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex overflow-hidden">
      <Sidebar 
        user={user} 
        onLogin={handleLogin}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      
      <main className="flex-1 flex flex-col w-full h-full">
        <header className="flex-shrink-0 flex items-center justify-between p-4 md:hidden sticky top-0 bg-gray-900/80 backdrop-blur-sm z-10 border-b border-gray-700">
          <button onClick={() => setIsSidebarOpen(true)} aria-label="Open sidebar">
            <Menu size={24} />
          </button>
          <span className="text-lg font-bold">Dashboard</span>
          <div className="w-6"></div> {/* Spacer */}
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}