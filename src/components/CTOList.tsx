import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, query, onSnapshot, where, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Box, Plus, Trash2, Edit, ExternalLink, MapPin, Search, Filter, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CTO, OperationType } from '../types';
import { CTOModal } from './CTOModal';
import { CTODetailsModal } from './CTODetailsModal';
import { cn } from '../lib/utils';

interface CTOListProps {
  searchTerm: string;
  forceOpenModal?: boolean;
  onModalClose?: () => void;
}

export function CTOList({ searchTerm, forceOpenModal, onModalClose }: CTOListProps) {
  const [ctos, setCtos] = useState<CTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedCTO, setSelectedCTO] = useState<CTO | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('todos');

  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (forceOpenModal) {
      setSelectedCTO(undefined);
      setIsModalOpen(true);
    }
  }, [forceOpenModal]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch CTOs
    const qCTOs = query(
      collection(db, 'ctos'),
      orderBy('name', 'asc')
    );

    const unsubscribeCTOs = onSnapshot(qCTOs, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CTO));
      setCtos(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ctos');
    });

    // Fetch Client Counts
    const qClients = query(
      collection(db, 'clients')
    );

    const unsubscribeClients = onSnapshot(qClients, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.forEach(doc => {
        const ctoId = doc.data().ctoId;
        counts[ctoId] = (counts[ctoId] || 0) + 1;
      });
      setClientCounts(counts);
    });

    return () => {
      unsubscribeCTOs();
      unsubscribeClients();
    };
  }, []);

  const neighborhoods = Array.from(new Set(ctos.map(cto => cto.address?.neighborhood).filter(Boolean))).sort() as string[];

  const filteredCtos = ctos.filter(cto => {
    const search = searchTerm.toLowerCase();
    const nameMatch = cto.name.toLowerCase().includes(search);
    const locationMatch = cto.location.toLowerCase().includes(search);
    const addressMatch = cto.address ? 
      `${cto.address.street} ${cto.address.neighborhood} ${cto.address.city} ${cto.address.cep}`.toLowerCase().includes(search) : false;
      
    const searchMatch = nameMatch || locationMatch || addressMatch;
    
    if (!searchMatch) return false;
    
    if (selectedNeighborhood !== 'todos') {
      return cto.address?.neighborhood === selectedNeighborhood;
    }
    
    return true;
  }).sort((a, b) => {
    // Natural numerical sort for CTO names (e.g., CTO 01 < CTO 10)
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta CTO? Todos os clientes vinculados perderão a referência.')) {
      try {
        await deleteDoc(doc(db, 'ctos', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `ctos/${id}`);
      }
    }
  };

  if (loading) return <div className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2 px-4 py-8"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" /> Carregando caixa de dados...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 mb-3">
        <div>
          <h1 className="text-sm font-black uppercase tracking-tight text-slate-900 leading-none">Caixas de Distribuição (CTO)</h1>
          <p className="text-slate-400 text-[10px] uppercase font-bold mt-1">Gerenciamento de infraestrutura.</p>
        </div>
        <div className="flex items-stretch overflow-hidden rounded-xl shadow-lg shadow-indigo-100 border border-slate-200">
          <button
            onClick={() => setShowFilters(!showFilters)}
            title={showFilters ? 'Ocultar filtros' : 'Filtrar resultados'}
            className={cn(
              "flex items-center justify-center px-4 transition-all",
              showFilters 
                ? "bg-slate-100 text-slate-600" 
                : "bg-white text-slate-400 hover:bg-slate-50 border-r border-slate-100"
            )}
          >
            <Filter className={cn("w-3.5 h-3.5 transition-transform", showFilters && "rotate-180")} />
          </button>
          <button
            onClick={() => { setSelectedCTO(undefined); setIsModalOpen(true); }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3.5 hover:bg-indigo-700 transition-all font-bold"
          >
            <Plus className="w-5 h-5 text-indigo-100" />
            <span className="text-xs uppercase tracking-widest lg:text-sm lg:normal-case lg:tracking-normal">Adicionar</span>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden bg-slate-50 rounded-2xl border border-slate-200 mb-6"
          >
            <div className="p-3 md:p-4 flex flex-wrap items-center justify-between gap-y-3 gap-x-2 md:gap-4">
              <div className="flex flex-wrap items-center gap-3 md:gap-6">
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Bairro:</span>
                  <select
                    value={selectedNeighborhood}
                    onChange={(e) => setSelectedNeighborhood(e.target.value)}
                    className="bg-white border border-indigo-200 text-indigo-600 text-[10px] md:text-xs font-bold rounded-lg px-2 md:px-3 py-1.5 md:py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                  >
                    <option value="todos">TODOS</option>
                    {neighborhoods.map(neighborhood => (
                      <option key={neighborhood} value={neighborhood}>{neighborhood.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-200/50 px-3 py-1.5 rounded-full ml-auto">
                {filteredCtos.length} CTOs Encontradas
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {ctos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 lg:p-16 text-center shadow-sm">
          <div className="w-16 h-16 lg:w-20 lg:h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Box className="w-8 h-8 lg:w-10 lg:h-10 text-slate-300" />
          </div>
          <p className="text-lg font-bold text-slate-800">Nenhuma CTO Cadastrada</p>
          <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">Comece organizando sua rede adicionando as primeiras caixas de distribuição.</p>
        </div>
      ) : filteredCtos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-20 text-center shadow-sm">
          <Search className="w-10 h-10 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum resultado para "{searchTerm}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          <AnimatePresence mode="popLayout">
            {filteredCtos.map((cto, index) => {
              const count = clientCounts[cto.id] || 0;
              const occupancy = (count / cto.capacity) * 100;
              const colors = [
                "bg-blue-50/40 border-blue-100/50",
                "bg-purple-50/40 border-purple-100/50",
                "bg-emerald-50/40 border-emerald-100/50"
              ];
              const colorClass = colors[index % colors.length];
              
              return (
                <motion.div
                  key={cto.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "relative border p-5 lg:p-6 rounded-2xl shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between overflow-hidden",
                    colorClass
                  )}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                  
                  <div className="relative">
                    <div className="flex justify-between items-start mb-5">
                      <div className="bg-white/80 p-2.5 lg:p-3 rounded-xl text-indigo-600 shadow-sm border border-slate-100">
                        <Box className="w-5 h-5 lg:w-6 lg:h-6" />
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => { setSelectedCTO(cto); setIsModalOpen(true); }}
                          className="p-2 bg-white/80 hover:bg-white rounded-lg text-slate-600 transition-colors shadow-sm border border-slate-100"
                        >
                          <Edit className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(cto.id)}
                          className="p-2 bg-white/80 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors shadow-sm border border-slate-100"
                        >
                          <Trash2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4 mb-6 lg:mb-8">
                      <div>
                        <h3 className="text-lg lg:text-xl font-bold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">{cto.name}</h3>
                        <div className="space-y-1 mt-1.5">
                          {cto.address && (
                            <div className="flex items-center gap-2 text-slate-700">
                              <MapPin className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                              <p className="text-[11px] font-bold truncate">
                                {cto.address.street}, {cto.address.number}
                              </p>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-slate-400">
                            <div className="w-3" />
                            <p className="text-[10px] font-medium truncate uppercase tracking-tighter">
                              {cto.address ? `${cto.address.neighborhood} • ${cto.address.city}` : cto.location}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                          <span className="text-slate-500">Ocupação</span>
                          <span className={cn(
                            occupancy > 90 ? "text-red-500" : occupancy > 75 ? "text-amber-500" : "text-indigo-600"
                          )}>
                            {count} / {cto.capacity} ({occupancy.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-white/60 rounded-full overflow-hidden shadow-inner border border-black/5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${occupancy}%` }}
                            className={cn(
                              "h-full rounded-full transition-all duration-1000 shadow-sm",
                              occupancy > 90 ? "bg-red-500" : occupancy > 75 ? "bg-amber-500" : "bg-indigo-500"
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                    <div className="relative pt-4 lg:pt-5 border-t border-black/5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full animate-pulse",
                          occupancy >= 100 
                            ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" 
                            : "bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                        )} />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {occupancy >= 100 ? "Saturada" : "Disponível"}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {cto.address && (
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cto.address.street}, ${cto.address.number}, ${cto.address.neighborhood}, ${cto.address.city}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-indigo-600 font-bold text-[10px] lg:text-xs bg-indigo-50 px-3 py-1.5 rounded-full shadow-sm border border-indigo-100 transition-all hover:bg-indigo-100"
                            title="Navegar para CTO"
                          >
                            <Navigation className="w-3 h-3 lg:w-3.5 lg:h-3.5 fill-indigo-600/20" />
                            IR
                          </a>
                        )}
                        <button 
                          onClick={() => { setSelectedCTO(cto); setIsDetailsModalOpen(true); }}
                          className="flex items-center gap-2 text-slate-600 font-bold text-[10px] lg:text-xs hover:gap-3 bg-white/80 px-3 py-1.5 rounded-full shadow-sm border border-slate-100 transition-all hover:shadow-md"
                        >
                          CLIENTES
                          <ExternalLink className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                        </button>
                      </div>
                    </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <CTOModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          onModalClose?.();
        }} 
        cto={selectedCTO}
      />

      <CTODetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        cto={selectedCTO}
      />
    </div>
  );
}
