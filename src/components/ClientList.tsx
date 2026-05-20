import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, query, onSnapshot, where, orderBy, deleteDoc, doc, getDocs, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { Users, Plus, Trash2, Edit, Filter, ArrowUpDown, ChevronRight, Phone, CreditCard, Hash, MapPin, Box, Calendar, RefreshCcw, ExternalLink, HelpCircle, Clock, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Client, CTO, OperationType } from '../types';
import { ClientModal } from './ClientModal';
import { CTODetailsModal } from './CTODetailsModal';
import { cn, getMaintenanceStatus } from '../lib/utils';

interface ClientListProps {
  searchTerm: string;
  forceOpenModal?: boolean;
  onModalClose?: () => void;
}

type SortField = 'name' | 'address' | 'port';
type SortOrder = 'asc' | 'desc';

export function ClientList({ searchTerm, forceOpenModal, onModalClose }: ClientListProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [ctos, setCtos] = useState<Record<string, CTO>>({});
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | undefined>();
  
  // Modal and Confirmation states
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedCtoForDetails, setSelectedCtoForDetails] = useState<CTO | null>(null);
  const [ctoToConfirm, setCtoToConfirm] = useState<CTO | null>(null);
  const [clientToUpdate, setClientToUpdate] = useState<Client | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  useEffect(() => {
    if (forceOpenModal) {
      setSelectedClient(undefined);
      setIsModalOpen(true);
    }
  }, [forceOpenModal]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch CTOs for display mapping and details
    const ctoQuery = query(collection(db, 'ctos'), where('createdBy', '==', auth.currentUser.uid));
    getDocs(ctoQuery).then(snap => {
      const mapping: Record<string, CTO> = {};
      snap.forEach(doc => {
        mapping[doc.id] = { id: doc.id, ...doc.data() } as CTO;
      });
      setCtos(mapping);
    });

    const q = query(
      collection(db, 'clients'),
      where('createdBy', '==', auth.currentUser.uid),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    return unsubscribe;
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm('Excluir registro de cliente?')) {
      try {
        await deleteDoc(doc(db, 'clients', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
      }
    }
  };

  const handleMaintenanceUpdate = async (client: Client) => {
    setClientToUpdate(client);
  };

  const handleQueueToggle = async (client: Client) => {
    try {
      const newState = !client.inWaitingQueue;
      
      // Enforce 30-day rule if adding to queue
      if (newState) {
        const status = getMaintenanceStatus(client.lastMaintenanceDate);
        if (status.isRed) {
          alert('Este cliente foi visitado recentemente (menos de 30 dias) e não pode ser adicionado à fila de hoje.');
          return;
        }
      }

      await updateDoc(doc(db, 'clients', client.id), {
        inWaitingQueue: newState,
        addedToQueueAt: newState ? serverTimestamp() : deleteField(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${client.id}`);
    }
  };

  const confirmMaintenanceUpdate = async () => {
    if (!clientToUpdate) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      await updateDoc(doc(db, 'clients', clientToUpdate.id), {
        lastMaintenanceDate: today,
        lastMaintenanceByName: auth.currentUser?.displayName || auth.currentUser?.email || 'Sistema',
        updatedAt: serverTimestamp()
      });
      setClientToUpdate(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientToUpdate.id}`);
    }
  };

  const handleCtoClick = (cto: CTO) => {
    setCtoToConfirm(cto);
  };

  const confirmCtoConsult = () => {
    if (ctoToConfirm) {
      setSelectedCtoForDetails(ctoToConfirm);
      setIsDetailsModalOpen(true);
      setCtoToConfirm(null);
    }
  };

  const filteredAndSortedClients = clients
    .filter(client => {
      const search = searchTerm.toLowerCase();
      const addrString = `${client.address.street} ${client.address.number} ${client.address.neighborhood}`.toLowerCase();
      
      const basicMatch = (
        client.name.toLowerCase().includes(search) ||
        client.cpf.includes(search) ||
        client.circuit.toLowerCase().includes(search) ||
        addrString.includes(search)
      );

      if (!basicMatch) return false;

      if (showOverdueOnly) {
        const status = getMaintenanceStatus(client.lastMaintenanceDate);
        return status.days !== null && status.days > 30;
      }

      return true;
    })
    .sort((a, b) => {
      let valA: string | number = '';
      let valB: string | number = '';

      if (sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === 'address') {
        valA = `${a.address.street} ${a.address.number}`.toLowerCase();
        valB = `${b.address.street} ${b.address.number}`.toLowerCase();
      } else if (sortField === 'port') {
        valA = a.port;
        valB = b.port;
      }

      const modifier = sortOrder === 'asc' ? 1 : -1;
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  if (loading) return <div className="text-sm font-medium text-slate-400 uppercase tracking-widest flex items-center gap-2 px-4 py-8"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" /> Carregando base de assinantes...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
        <div>
          <h1 className="text-sm font-black uppercase tracking-tight text-slate-900 leading-none">Base de Clientes</h1>
          <p className="text-slate-400 text-[10px] uppercase font-bold mt-1">Gerenciamento completo de assinantes.</p>
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
            onClick={() => { setSelectedClient(undefined); setIsModalOpen(true); }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3.5 hover:bg-indigo-700 transition-all font-bold"
          >
            <Plus className="w-5 h-5" />
            ADICIONAR
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar / Sorting */}
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden bg-slate-50/50 border-b border-slate-100"
            >
              <div className="p-3 md:p-4 flex flex-wrap items-center justify-between gap-y-3 gap-x-2 md:gap-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Ordenação:</span>
                  <div className="flex items-center gap-1 md:gap-2">
                    {(['name', 'address', 'port'] as SortField[]).map(field => (
                      <button
                        key={field}
                        onClick={() => toggleSort(field)}
                        className={cn(
                          "flex items-center gap-1.5 px-2 md:px-4 py-1.5 md:py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all border",
                          sortField === field 
                            ? "bg-white border-indigo-200 text-indigo-600 shadow-sm" 
                            : "bg-transparent border-transparent text-slate-500 hover:bg-white hover:border-slate-200"
                        )}
                      >
                        {field === 'name' ? 'Nome' : field === 'address' ? 'End.' : 'Porta'}
                        {sortField === field && (
                          <ArrowUpDown className={cn("w-3 h-3 md:w-3.5 md:h-3.5", sortOrder === 'desc' && "rotate-180")} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3 md:border-l md:border-slate-200 md:pl-4">
                  <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Filtrar:</span>
                  <button
                    onClick={() => setShowOverdueOnly(!showOverdueOnly)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 md:px-4 py-1.5 md:py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all border",
                      showOverdueOnly 
                        ? "bg-amber-50 border-amber-200 text-amber-700 shadow-sm" 
                        : "bg-transparent border-transparent text-slate-500 hover:bg-white hover:border-slate-200"
                    )}
                  >
                    <Calendar className={cn("w-3 h-3 md:w-3.5 md:h-3.5", showOverdueOnly ? "text-amber-500" : "text-slate-400")} />
                    +30 DIAS
                  </button>
                </div>

                <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-200/50 px-3 py-1.5 rounded-full ml-auto">
                  {filteredAndSortedClients.length} Registros
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Cliente / CPF</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Circuito / Rede</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Localização</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Manutenção</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Distribuição</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {filteredAndSortedClients.map((client, index) => {
                const colors = [
                  "bg-indigo-50/20 hover:bg-indigo-50/40",
                  "bg-emerald-50/20 hover:bg-emerald-50/40",
                  "bg-amber-50/20 hover:bg-amber-50/40"
                ];
                const colorClass = colors[index % colors.length];
                
                return (
                  <tr key={client.id} className={cn("transition-colors group", colorClass)}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{client.name}</span>
                        <span className="text-[10px] font-medium text-slate-400">{client.cpf}</span>
                      </div>
                    </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-700">{client.circuit}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-tighter">Porta {client.port}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${client.address.street}, ${client.address.number}, ${client.address.neighborhood}, ${client.address.city}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col group/addr"
                    >
                      <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{client.address.street}, {client.address.number}</span>
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                        {client.address.neighborhood}
                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/addr:opacity-100 transition-opacity" />
                      </span>
                    </a>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const status = getMaintenanceStatus(client.lastMaintenanceDate);
                      return (
                        <div className="flex items-center gap-3 group/maint">
                          <div className={cn(
                            "w-2.5 h-2.5 rounded-full", 
                            status.isRed 
                              ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" 
                              : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                          )} />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700">{status.text}</span>
                            {status.days !== null && (
                              <div className="flex flex-col">
                                <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tighter">
                                  {status.days} dias atrás
                                </span>
                                {status.isRed && client.lastMaintenanceByName && (
                                  <span className="text-[8px] font-black text-indigo-500 uppercase tracking-tighter">
                                    Por: {client.lastMaintenanceByName}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleMaintenanceUpdate(client)}
                            className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg opacity-0 group-hover/maint:opacity-100 transition-opacity"
                            title="Atualizar para Hoje"
                          >
                            <RefreshCcw className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    {ctos[client.ctoId] ? (
                      <button 
                        onClick={() => handleCtoClick(ctos[client.ctoId])}
                        className="flex items-center gap-2 text-xs font-bold text-indigo-600 px-3 py-2 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all border border-indigo-100 hover:border-indigo-200"
                      >
                        <Box className="w-4 h-4 text-indigo-400" />
                        {ctos[client.ctoId].name}
                        <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                        <Box className="w-4 h-4 text-slate-300" />
                        <span className="animate-pulse">Carregando...</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button 
                        onClick={() => handleQueueToggle(client)}
                        disabled={!client.inWaitingQueue && getMaintenanceStatus(client.lastMaintenanceDate).isRed}
                        className={cn(
                          "p-2 rounded-lg transition-all shadow-sm border",
                          client.inWaitingQueue 
                            ? "bg-amber-50 text-amber-600 border-amber-200" 
                            : getMaintenanceStatus(client.lastMaintenanceDate).isRed
                              ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                              : "bg-white text-slate-400 hover:text-indigo-600 border-transparent hover:border-slate-200"
                        )}
                        title={client.inWaitingQueue ? "Remover da fila" : getMaintenanceStatus(client.lastMaintenanceDate).isRed ? "Visita muito recente (< 30 dias)" : "Adicionar à fila"}
                      >
                        {client.inWaitingQueue ? <UserCheck className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => { setSelectedClient(client); setIsModalOpen(true); }}
                        className="p-2 bg-slate-50 hover:bg-white hover:border-slate-200 border border-transparent rounded-lg text-slate-600 transition-all shadow-sm"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(client.id)}
                        className="p-2 bg-red-50 hover:bg-red-100 rounded-lg text-red-600 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>

        {/* Mobile View: Card List */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredAndSortedClients.map((client, index) => {
            const colors = [
              "bg-indigo-50/30 border-indigo-100",
              "bg-emerald-50/30 border-emerald-100",
              "bg-amber-50/30 border-amber-100"
            ];
            const colorClass = colors[index % colors.length];
            const maintStatus = getMaintenanceStatus(client.lastMaintenanceDate);
            
            return (
              <div key={client.id} className={cn("p-4 space-y-3 border-l-4 relative", colorClass)}>
                {/* Neon Status Indicator */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    maintStatus.isRed 
                      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" 
                      : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                  )} />
                </div>

                {/* Smaller Name & Maint info */}
                <div className="flex justify-between items-start pr-8">
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-tight truncate max-w-[150px]">{client.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Calendar className="w-2.5 h-2.5 text-slate-400" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Ult. Visita: {maintStatus.text}</span>
                      {maintStatus.isRed && client.lastMaintenanceByName && (
                        <span className="text-[8px] font-black text-indigo-500 uppercase ml-1">({client.lastMaintenanceByName})</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setSelectedClient(client); setIsModalOpen(true); }}
                      className="p-1.5 bg-white/80 rounded-lg text-slate-600 shadow-sm border border-slate-200/50"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(client.id)}
                      className="p-1.5 bg-red-50 rounded-lg text-red-600 shadow-sm border border-red-100/50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Main Highlighted Info */}
                <div className="space-y-3">
                  {/* CPF Highlight */}
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Documento (CPF)</p>
                    <p className="text-xl font-black text-slate-900 tracking-tighter leading-none">{client.cpf}</p>
                  </div>

                  {/* Technical Row: CTO, PORTA, CIRCUITO */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-200/30">
                    <div className="space-y-0.5">
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">Rede (CTO)</p>
                      {ctos[client.ctoId] ? (
                        <button 
                          onClick={() => handleCtoClick(ctos[client.ctoId])}
                          className="w-full text-left group/ctobtn"
                        >
                          <div className="text-[10px] font-black text-indigo-700 truncate group-hover/ctobtn:text-indigo-500 transition-colors">
                            {ctos[client.ctoId].name}
                          </div>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300">...</span>
                      )}
                    </div>
                    <div className="space-y-0.5 border-x border-slate-200/50 px-2">
                       <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">Conexão</p>
                       <div className="text-[10px] font-black text-slate-900 leading-none">
                         Porta <span className="text-indigo-600">{client.port}</span>
                       </div>
                    </div>
                    <div className="space-y-0.5 min-w-0">
                       <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">Circuito</p>
                       <div className="text-[10px] font-black text-slate-900 truncate uppercase mt-0.5 leading-none">
                         {client.circuit}
                       </div>
                    </div>
                  </div>

                  {/* Clickable Map Address */}
                  <div className="space-y-1">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Local de Instalação</p>
                    <a 
                       href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${client.address.street}, ${client.address.number}, ${client.address.neighborhood}, ${client.address.city}`)}`}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="flex items-start gap-2 bg-white/60 p-2.5 rounded-xl border border-slate-200 transition-all hover:border-indigo-300 hover:bg-white shadow-sm group/addr"
                    >
                      <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5 group-hover/addr:scale-110 transition-transform" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-900 leading-tight">
                          {client.address.street}, {client.address.number}
                        </p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tight mt-0.5 leading-tight">
                          {client.address.neighborhood} • {client.address.city}
                        </p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-slate-300 group-hover/addr:text-indigo-400 transition-colors self-center" />
                    </a>
                  </div>
                </div>

                <div className="pt-2 flex justify-between items-center">
                   <button
                    onClick={() => handleQueueToggle(client)}
                    disabled={!client.inWaitingQueue && maintStatus.isRed}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg border font-bold text-[10px] uppercase tracking-widest transition-all",
                      client.inWaitingQueue 
                        ? "bg-amber-50 text-amber-700 border-amber-200" 
                        : maintStatus.isRed
                          ? "bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed"
                          : "bg-white text-indigo-600 border-indigo-100"
                    )}
                  >
                    {client.inWaitingQueue ? (
                      <><UserCheck className="w-3.5 h-3.5" /> Fila</>
                    ) : maintStatus.isRed ? (
                      <><Clock className="w-3.5 h-3.5" /> Recente</>
                    ) : (
                      <><Clock className="w-3.5 h-3.5" /> + Fila</>
                    )}
                  </button>

                   <button
                    onClick={() => handleMaintenanceUpdate(client)}
                    className="p-2 bg-white text-indigo-600 rounded-lg border border-indigo-100 shadow-sm active:scale-95 transition-all"
                    title="Atualizar Visita"
                  >
                    <RefreshCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        {filteredAndSortedClients.length === 0 && (
          <div className="p-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-200" />
            </div>
            <p className="text-slate-500 text-sm font-medium">Nenhum assinante encontrado para esta busca.</p>
          </div>
        )}
      </div>

      <ClientModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          onModalClose?.();
        }} 
        client={selectedClient}
      />

      <CTODetailsModal 
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedCtoForDetails(null);
        }}
        cto={selectedCtoForDetails || undefined}
      />

      {/* Confirmation Dialogs */}
      <AnimatePresence>
        {ctoToConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCtoToConfirm(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 border border-slate-100"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Consultar CTO?</h3>
                  <p className="text-xs text-slate-400 font-medium">Deseja visualizar o diagrama de conexões da {ctoToConfirm.name}?</p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setCtoToConfirm(null)}
                  className="flex-1 py-3 text-slate-500 font-bold text-[10px] uppercase tracking-widest bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Agora Não
                </button>
                <button
                  onClick={confirmCtoConsult}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                >
                  SIM, CONSULTAR
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {clientToUpdate && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setClientToUpdate(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 border border-slate-100"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                  <RefreshCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Atualizar Visita?</h3>
                  <p className="text-xs text-slate-400 font-medium">Deseja registrar uma nova manutenção para {clientToUpdate.name} na data de hoje?</p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setClientToUpdate(null)}
                  className="flex-1 py-3 text-slate-500 font-bold text-[10px] uppercase tracking-widest bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmMaintenanceUpdate}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
