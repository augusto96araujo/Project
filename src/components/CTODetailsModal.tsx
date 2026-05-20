import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, query, getDocs, where, doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { X, Box, User, MapPin, Hash, Activity, Edit, RefreshCcw, Navigation, Clock, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CTO, Client, OperationType } from '../types';
import { ClientModal } from './ClientModal';
import { cn, getMaintenanceStatus } from '../lib/utils';

interface CTODetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cto: CTO | undefined;
}

export function CTODetailsModal({ isOpen, onClose, cto }: CTODetailsModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !cto || !auth.currentUser) return;

    setLoading(true);
    const q = query(
      collection(db, 'clients'),
      where('ctoId', '==', cto.id),
      where('createdBy', '==', auth.currentUser.uid)
    );

    getDocs(q).then(snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, cto]);

  const handleMaintenanceUpdate = async (client: Client) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const userName = auth.currentUser?.displayName || auth.currentUser?.email || 'Sistema';
      await updateDoc(doc(db, 'clients', client.id), {
        lastMaintenanceDate: today,
        lastMaintenanceByName: userName,
        updatedAt: serverTimestamp()
      });
      // Update local state
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, lastMaintenanceDate: today, lastMaintenanceByName: userName } : c));
      if (selectedClient?.id === client.id) {
        setSelectedClient(prev => prev ? { ...prev, lastMaintenanceDate: today, lastMaintenanceByName: userName } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${client.id}`);
    }
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
      // Update local state
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, inWaitingQueue: newState } : c));
      if (selectedClient?.id === client.id) {
        setSelectedClient(prev => prev ? { ...prev, inWaitingQueue: newState } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${client.id}`);
    }
  };

  if (!cto) return null;

  // Map clients to ports
  const portMap: Record<number, Client> = {};
  clients.forEach(client => {
    portMap[client.port] = client;
  });

  const occupiedPorts = Object.keys(portMap).map(Number).sort((a, b) => a - b);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl flex flex-col lg:flex-row overflow-hidden max-h-[90vh] border border-slate-100"
          >
            {/* Sidebar with CTO Info */}
            <div className="w-full lg:w-80 bg-slate-50 p-4 lg:p-8 border-r border-slate-100 shrink-0">
              <div className="flex items-center justify-between mb-4 lg:mb-8">
                <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-200">
                  <Box className="w-6 h-6" />
                </div>
                <button onClick={onClose} className="p-2 lg:hidden text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 lg:space-y-6">
                <div>
                  <h2 className="text-lg lg:text-xl font-bold text-slate-900 leading-tight">{cto.name}</h2>
                  <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Status da Caixa</p>
                </div>

                <div className="space-y-3 lg:space-y-4">
                  {cto.address ? (
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cto.address.street}, ${cto.address.number}, ${cto.address.neighborhood}, ${cto.address.city}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 lg:gap-3 group/ctoaddr bg-white p-2.5 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all shadow-sm"
                    >
                      <MapPin className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500 shrink-0 mt-0.5 group-hover/ctoaddr:scale-110 transition-transform" />
                      <div>
                        <p className="text-[11px] lg:text-xs font-bold text-slate-800 leading-tight">
                          {cto.address.street}, {cto.address.number}
                        </p>
                        <p className="text-[10px] lg:text-[11px] text-slate-500 font-medium tracking-tight">
                          {cto.address.neighborhood}, {cto.address.city}
                        </p>
                        {cto.location && (
                          <p className="text-[9px] text-indigo-400 font-black uppercase mt-1.5 flex items-center gap-1">
                            <span className="w-1 h-1 bg-indigo-400 rounded-full" />
                            Ref: {cto.location}
                          </p>
                        )}
                      </div>
                    </a>
                  ) : (
                    <div className="flex items-center lg:items-start gap-2 lg:gap-3">
                      <MapPin className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-indigo-500 shrink-0" />
                      <div>
                        <p className="hidden lg:block text-xs font-bold text-slate-700">Localização</p>
                        <p className="text-[11px] lg:text-xs text-slate-500 leading-relaxed truncate lg:whitespace-normal">{cto.location}</p>
                      </div>
                    </div>
                  )}

                  {cto.address && (
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cto.address.street}, ${cto.address.number}, ${cto.address.neighborhood}, ${cto.address.city}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98]"
                    >
                      <Navigation className="w-4 h-4 fill-white/20" />
                      Ir para CTO
                    </a>
                  )}
                </div>

                <div className="pt-4 lg:pt-6 border-t border-slate-200">
                  <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 lg:mb-3">Portas Status</p>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:gap-3">
                    <div className="flex items-center justify-between bg-white p-2.5 lg:p-3 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1.5 lg:gap-2">
                        <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 bg-indigo-500 rounded-full" />
                        <span className="text-[9px] lg:text-[10px] font-bold text-slate-600 uppercase tracking-tight">Ocupadas</span>
                      </div>
                      <span className="text-xs lg:text-sm font-bold text-slate-900">{clients.length}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white p-2.5 lg:p-3 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1.5 lg:gap-2">
                        <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 bg-emerald-500 rounded-full" />
                        <span className="text-[9px] lg:text-[10px] font-bold text-slate-600 uppercase tracking-tight">Vazias</span>
                      </div>
                      <span className="text-xs lg:text-sm font-bold text-slate-900">{cto.capacity - clients.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ports Grid */}
            <div className="flex-1 overflow-auto p-4 lg:p-8 bg-white relative">
              <div className="flex items-center justify-between mb-4 lg:mb-8 sticky top-0 bg-white z-10 py-1">
                <h3 className="text-base lg:text-lg font-bold text-slate-800">Assinantes Conectados</h3>
                <button onClick={onClose} className="hidden lg:flex p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center p-20">
                  <Activity className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              ) : occupiedPorts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 lg:p-20 text-center bg-slate-50 rounded-3xl border border-slate-100/50">
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <User className="w-8 h-8 text-slate-200" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider">CTO Vazia</h4>
                  <p className="text-xs text-slate-400 mt-2 max-w-[240px]">Esta caixa de atendimento ainda não possui clientes conectados em suas portas.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {occupiedPorts.map((port) => {
                    const client = portMap[port];
                    return (
                      <button
                        key={port}
                        onClick={() => setSelectedClient(client)}
                        className={cn(
                          "relative w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between group bg-white border-slate-200 hover:border-indigo-500 hover:bg-slate-50/50"
                        )}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-transform group-hover:scale-110",
                            "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
                          )}>
                            {port}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-800 truncate">{client.name}</p>
                                <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full uppercase shrink-0">{client.circuit}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 group-hover:text-slate-700 transition-colors">
                                <MapPin className="w-3 h-3 shrink-0 text-slate-300" />
                                <span className="leading-tight">{client.address.street}, {client.address.number} - {client.address.neighborhood}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="ml-4 flex items-center gap-3">
                          <div className={cn("w-2 h-2 rounded-full", getMaintenanceStatus(client.lastMaintenanceDate).color)} />
                          <div className="hidden sm:block p-2 bg-slate-100 rounded-lg text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            <Activity className="w-4 h-4" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>

          {/* Sub-modal: Detailed Client Info */}
          <AnimatePresence>
            {selectedClient && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
              >
                <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                    <User className="w-32 h-32" />
                  </div>

                  <div className="flex items-center justify-between mb-8">
                    <h4 className="text-lg font-bold text-slate-900">Detalhes do Assinante</h4>
                    <button onClick={() => setSelectedClient(null)} className="p-2 hover:bg-slate-100 rounded-xl">
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>

                  <div className="space-y-6 relative z-10">
                    <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-600 font-bold text-xl">
                        {selectedClient.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-900">{selectedClient.name}</p>
                        <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">{selectedClient.cpf}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Circuito</p>
                        <p className="text-sm font-bold text-slate-700">{selectedClient.circuit}</p>
                      </div>
                      <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100 text-white">
                        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">Porta Alocada</p>
                        <p className="text-lg font-bold"># {selectedClient.port}</p>
                      </div>
                    </div>

                    {selectedClient.lastMaintenanceDate && (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Última Manutenção</p>
                          <p className="text-sm font-bold text-slate-700">
                            {getMaintenanceStatus(selectedClient.lastMaintenanceDate).text}
                          </p>
                          {getMaintenanceStatus(selectedClient.lastMaintenanceDate).isRed && selectedClient.lastMaintenanceByName && (
                            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter mt-0.5">
                              Visitado por: {selectedClient.lastMaintenanceByName}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleMaintenanceUpdate(selectedClient)}
                            className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors mr-2"
                            title="Atualizar para Hoje"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </button>
                          <div className={cn("w-3 h-3 rounded-full shadow-sm", getMaintenanceStatus(selectedClient.lastMaintenanceDate).color)} />
                        </div>
                      </div>
                    )}

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">Endereço de Conexão</p>
                          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                            {selectedClient.address.street}, {selectedClient.address.number}<br/>
                            {selectedClient.address.neighborhood}, {selectedClient.address.city} - {selectedClient.address.state}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                    <div className="flex flex-col gap-3 mt-8">
                      {selectedClient.inWaitingQueue ? (
                        <button 
                           onClick={() => handleQueueToggle(selectedClient)}
                           className="w-full py-3.5 font-bold text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 border shadow-sm bg-amber-50 text-amber-700 border-amber-200"
                        >
                          <UserCheck className="w-4 h-4" />
                          Na Fila (Remover)
                        </button>
                      ) : (
                        <button 
                           disabled={getMaintenanceStatus(selectedClient.lastMaintenanceDate).isRed}
                           onClick={() => handleQueueToggle(selectedClient)}
                           className={cn(
                             "w-full py-3.5 font-bold text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 border shadow-sm",
                             getMaintenanceStatus(selectedClient.lastMaintenanceDate).isRed
                               ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                               : "bg-white text-indigo-600 border-indigo-200 hover:bg-slate-50"
                           )}
                        >
                          <Clock className="w-4 h-4" />
                          {getMaintenanceStatus(selectedClient.lastMaintenanceDate).isRed 
                            ? "Visita Recente (< 30d)" 
                            : "Adicionar à Fila"}
                        </button>
                      )}
                      
                      <button 
                        onClick={() => setIsClientModalOpen(true)}
                        className="w-full py-3.5 bg-slate-900 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Editar Dados
                      </button>
                    </div>
                    <button 
                      onClick={() => setSelectedClient(null)}
                      className="w-full mt-3 py-3.5 bg-slate-100 text-slate-500 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all"
                    >
                      Fechar
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          <ClientModal 
            isOpen={isClientModalOpen}
            onClose={() => {
              setIsClientModalOpen(false);
              // Refresh client data in the list if needed
              if (cto && auth.currentUser) {
                const q = query(
                  collection(db, 'clients'),
                  where('ctoId', '==', cto.id),
                  where('createdBy', '==', auth.currentUser.uid)
                );
                getDocs(q).then(snap => {
                  const updatedClients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
                  setClients(updatedClients);
                  // Update selected client if it was edited
                  if (selectedClient) {
                    const updated = updatedClients.find(c => c.id === selectedClient.id);
                    if (updated) setSelectedClient(updated);
                  }
                });
              }
            }}
            client={selectedClient || undefined}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
