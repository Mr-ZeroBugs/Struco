'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from 'firebase/auth';
import { db } from '@/app/firebase/config';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, Timestamp, doc, deleteDoc } from 'firebase/firestore';
import { BrainCircuit, Plus, Trash2 } from 'lucide-react';

interface Plan {
  id: string;
  title: string;
  createdAt: Timestamp;
}

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const plansRef = collection(db, 'users', user.uid, 'plans');
    const q = query(plansRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const plansData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Plan[];
      setPlans(plansData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlanTitle.trim() === '') return;
    const plansRef = collection(db, 'users', user.uid, 'plans');
    const newPlanData = {
      title: newPlanTitle,
      createdAt: serverTimestamp(),
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: newPlanTitle } }],
      edges: [],
    };
    await addDoc(plansRef, newPlanData);
    setNewPlanTitle('');
  };

  const handleDeletePlan = async (planId: string) => {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบแผนนี้? การกระทำนี้ไม่สามารถย้อนกลับได้")) {
        const planRef = doc(db, 'users', user.uid, 'plans', planId);
        await deleteDoc(planRef);
    }
  };

  const handleSelectPlan = (planId: string) => {
    router.push(`/plan/${planId}`);
  };

  if (isLoading) {
    return <div className="p-8 text-white">Loading plans...</div>
  }

  return (
    <div className="p-8 text-white h-full overflow-y-auto">
      <h1 className="text-3xl font-bold mb-6">My Life Maps</h1>
      
      <form onSubmit={handleCreatePlan} className="mb-8 flex gap-4">
        <input
          type="text"
          value={newPlanTitle}
          onChange={(e) => setNewPlanTitle(e.target.value)}
          placeholder="ตั้งชื่อแผนใหม่..."
          className="flex-grow bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors">
          <Plus size={20}/> สร้างแผน
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {plans.map(plan => (
          <div key={plan.id} className="bg-gray-800 rounded-lg flex flex-col group relative transition-shadow hover:shadow-lg hover:shadow-blue-500/20">
            <div 
              onClick={() => handleSelectPlan(plan.id)}
              className="p-6 cursor-pointer flex-grow"
            >
              <BrainCircuit className="h-8 w-8 text-blue-400 mb-4" />
              <h2 className="text-xl font-semibold truncate group-hover:text-blue-300 transition-colors">{plan.title}</h2>
            </div>
            <div className="border-t border-gray-700 p-2 flex justify-between items-center">
                <p className="text-xs text-gray-400 ml-2">
                  {plan.createdAt ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString() : 'เมื่อสักครู่'}
                </p>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan.id); }}
                  className="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-red-500/10"
                  aria-label="Delete Plan"
                >
                    <Trash2 size={16}/>
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}