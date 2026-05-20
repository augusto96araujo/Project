import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { Box, Users, Activity, ArrowUpRight, ChevronRight, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export function Dashboard({ onAction }: { onAction: (view: any, action: string) => void }) {
  const [stats, setStats] = useState({
    totalCtos: 0,
    totalClients: 0,
    avgOccupancy: 0,
    queueCount: 0
  });
  const [recentClients, setRecentClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!auth.currentUser) return;
      
      try {
        const ctosQuery = query(collection(db, 'ctos'), where('createdBy', '==', auth.currentUser.uid));
        const ctosSnap = await getDocs(ctosQuery);
        const totalCtos = ctosSnap.size;

        const clientsQuery = query(collection(db, 'clients'), where('createdBy', '==', auth.currentUser.uid));
        const clientsSnap = await getDocs(clientsQuery);
        const totalClients = clientsSnap.size;

        // Queue count
        const queueQuery = query(collection(db, 'clients'), where('createdBy', '==', auth.currentUser.uid), where('inWaitingQueue', '==', true));
        const queueSnap = await getDocs(queueQuery);
        const queueCount = queueSnap.size;

        // Recent clients
        const recentQuery = query(
          collection(db, 'clients'), 
          where('createdBy', '==', auth.currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        const recentSnap = await getDocs(recentQuery);
        setRecentClients(recentSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        let totalCapacity = 0;
        ctosSnap.forEach(doc => {
          totalCapacity += doc.data().capacity || 16; 
        });

        const avgOccupancy = totalCapacity > 0 ? (totalClients / totalCapacity) * 100 : 0;

        setStats({
          totalCtos,
          totalClients,
          avgOccupancy,
          queueCount
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <div>Carregando estatísticas...</div>;

  const cards = [
    { label: 'Total de CTOs', value: stats.totalCtos, icon: Box, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Visitas na Fila', value: stats.queueCount, icon: Clock, color: 'text-amber-600 bg-amber-50', action: () => onAction('queue', '') },
    { label: 'Clientes Ativos', value: stats.totalClients, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-sm font-black uppercase tracking-tight text-slate-900 leading-none">Visão Geral</h1>
        <p className="text-slate-400 text-[10px] uppercase font-bold">Resumo operacional da infraestrutura.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-8">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => (card as any).action?.()}
            className={cn(
              "bg-white border border-slate-200 p-5 lg:p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between",
              (card as any).action && "cursor-pointer hover:border-indigo-200 active:scale-95"
            )}
          >
            <div>
              <p className="text-[10px] lg:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
              <h3 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">{card.value}</h3>
            </div>
            <div className={cn("p-3 lg:p-3.5 rounded-xl", card.color)}>
              <card.icon className="w-5 h-5 lg:w-6 lg:h-6" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Recent Clients Section */}
        <div className="bg-white border border-slate-200 p-6 lg:p-8 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Clientes Recentes</h3>
            <button 
              onClick={() => onAction('clients', '')}
              className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest hover:underline"
            >
              Ver Todos
            </button>
          </div>
          
          <div className="space-y-4">
            {recentClients.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">Nenhum cliente cadastrado</p>
              </div>
            ) : (
              recentClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl group hover:bg-white transition-all border border-transparent hover:border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-indigo-600 font-bold border border-slate-100">
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{client.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Porta {client.port} • {client.circuit}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 lg:p-8 rounded-2xl shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center justify-between">
            Status de Ocupação da Rede
            <Activity className="w-5 h-5 text-indigo-500" />
          </h3>
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-500">
                <span>Capacidade Utilizada</span>
                <span className="text-indigo-600">{stats.avgOccupancy.toFixed(1)}%</span>
              </div>
              <div className="h-2.5 lg:h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.avgOccupancy}%` }}
                  className="h-full bg-indigo-500 rounded-full"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-[11px] lg:text-xs text-slate-500 leading-relaxed italic">
                “Dica: Otimize sua expansão monitorando áreas com ocupação acima de 80%.”
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-6 lg:p-8 rounded-2xl shadow-xl flex flex-col justify-between relative overflow-hidden group min-h-[200px]">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <Activity className="w-32 h-32 rotate-12" />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-bold mb-2 tracking-tight">Atalhos Operacionais</h3>
            <p className="text-slate-400 text-sm mb-6 lg:mb-10 max-w-xs">Acesse as principais funções rapidamente.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:gap-4 relative z-10">
            <button 
              onClick={() => onAction('ctos', 'new-cto')}
              className="flex items-center justify-between p-3 lg:p-4 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all text-left"
            >
              <span className="text-xs font-bold uppercase tracking-widest">Nova CTO</span>
              <ArrowUpRight className="w-4 h-4 text-indigo-400" />
            </button>
            <button 
              onClick={() => onAction('clients', 'new-client')}
              className="flex items-center justify-between p-3 lg:p-4 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all text-left"
            >
              <span className="text-[10px] lg:text-xs font-bold uppercase tracking-widest">Registrar Cliente</span>
              <ArrowUpRight className="w-4 h-4 text-indigo-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
