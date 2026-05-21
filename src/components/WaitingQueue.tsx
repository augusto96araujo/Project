import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, query, onSnapshot, where, doc, updateDoc, serverTimestamp, writeBatch, deleteField, orderBy } from 'firebase/firestore';
import { Users, Trash2, MapPin, Calendar, CheckCircle2, Clock, Navigation, ExternalLink, Activity, AlertCircle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Client, OperationType, CTO } from '../types';
import { cn, getMaintenanceStatus } from '../lib/utils';

export function WaitingQueue() {
  const [queue, setQueue] = useState<Client[]>([]);
  const [ctos, setCtos] = useState<Record<string, CTO>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Monitor CTOs in real-time for display mapping
    const ctoQuery = query(collection(db, 'ctos'), orderBy('name', 'asc'));
    const unsubscribeCtos = onSnapshot(ctoQuery, (snap) => {
      const mapping: Record<string, CTO> = {};
      snap.forEach(doc => {
        mapping[doc.id] = { id: doc.id, ...doc.data() } as CTO;
      });
      setCtos(mapping);
    });

    // Monitor clients in the queue
    const q = query(
      collection(db, 'clients'),
      where('inWaitingQueue', '==', true),
      where('inWaitingQueueBy', '==', auth.currentUser.uid)
    );

    const unsubscribeClients = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      // Sort by addedToQueueAt (if available) - oldest first
      data.sort((a, b) => {
        const valA = a.addedToQueueAt?.seconds || Date.now() / 1000;
        const valB = b.addedToQueueAt?.seconds || Date.now() / 1000;
        return valA - valB;
      });
      setQueue(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    return () => {
      unsubscribeCtos();
      unsubscribeClients();
    };
  }, []);

  const handleRemoveFromQueue = async (client: Client) => {
    try {
      await updateDoc(doc(db, 'clients', client.id), {
        inWaitingQueue: false,
        inWaitingQueueBy: deleteField(),
        inWaitingQueueByName: deleteField(),
        addedToQueueAt: deleteField(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${client.id}`);
    }
  };

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleCompleteAllVisits = async () => {
    if (queue.length === 0) return;
    if (!auth.currentUser) {
      alert('Sessão expirada. Por favor, faça login novamente.');
      return;
    }

    setProcessing(true);
    setShowConfirmModal(false);
    
    try {
      console.log('--- INICIANDO FINALIZAÇÃO DE FILA ---');
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayString = `${year}-${month}-${day}`;
      
      const userName = auth.currentUser.displayName || auth.currentUser.email || 'Técnico';

      const batch = writeBatch(db);
      
      queue.forEach(client => {
        const clientRef = doc(db, 'clients', client.id);
        batch.update(clientRef, {
          lastMaintenanceDate: todayString,
          lastMaintenanceByName: userName,
          inWaitingQueue: false,
          inWaitingQueueBy: deleteField(),
          inWaitingQueueByName: deleteField(),
          addedToQueueAt: deleteField(),
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      console.log('--- FILA FINALIZADA COM SUCESSO ---');
      alert('Sucesso! Todas as visitas foram confirmadas.');
    } catch (error) {
      console.error('Erro crítico na finalização da fila:', error);
      alert('Erro ao processar visitas. Verifique sua conexão e tente novamente.');
      handleFirestoreError(error, OperationType.WRITE, 'clients/complete-queue');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return (
// ... (omitted for brevity in search)
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <Clock className="w-8 h-8 animate-spin mb-4" />
      <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Carregando Fila...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 border-l-4 border-indigo-600 pl-4 py-1">Fila de Atendimento</h1>
          <p className="text-slate-400 text-[10px] uppercase font-bold mt-1 ml-4 tracking-widest">Controle de visitas agendadas para o período.</p>
        </div>
        
        {queue.length > 0 && (
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={processing}
            className="group relative flex items-center justify-center gap-3 bg-emerald-600 text-white px-8 py-4 rounded-2xl hover:bg-emerald-700 transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-100 disabled:opacity-50 active:scale-95"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity" />
            {processing ? (
              <Clock className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            CONFIRMAR TODAS AS VISITAS
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-xl shadow-slate-100 overflow-hidden">
        {queue.length === 0 ? (
          <div className="p-24 text-center">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-8 border border-slate-100">
              <Clock className="w-12 h-12 text-slate-200" />
            </div>
            <h3 className="text-slate-900 font-black text-lg uppercase tracking-tight mb-3">Fila Vazia</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest max-w-sm mx-auto leading-relaxed">
              Nenhum cliente na fila de hoje.<br/>Adicione-os através da lista de clientes ou detalhes da CTO.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <AnimatePresence>
              {queue.map((client, index) => {
                const maintStatus = getMaintenanceStatus(client.lastMaintenanceDate);
                return (
                  <motion.div
                    key={client.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 group hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-start gap-6">
                      <div className="w-14 h-14 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-100 shrink-0 group-hover:scale-110 transition-transform">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 mb-4">
                          <h3 className="font-black text-lg text-slate-900 tracking-tight leading-none">{client.name}</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {client.address.street}, {client.address.number} — {maintStatus.text}
                          </p>
                        </div>
                        
                        {/* New Metadata Grid showing CPF, CTO, PORT, CIRCUITO, BAIRRO */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-4xl">
                          {/* CPF */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex flex-col justify-center">
                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">CPF</span>
                            <span className="text-xs font-bold text-slate-700 font-mono mt-0.5">{client.cpf || 'Não informado'}</span>
                          </div>

                          {/* CTO */}
                          <div className="bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-2.5 flex flex-col justify-center">
                            <span className="text-[9px] uppercase font-black text-indigo-400 tracking-wider">CTO</span>
                            <span className="text-xs font-bold text-indigo-700 mt-0.5 truncate" title={ctos[client.ctoId]?.name || 'Nao cadastrada'}>
                              {ctos[client.ctoId]?.name || 'Nao cadastrada'}
                            </span>
                          </div>

                          {/* PORTA */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex flex-col justify-center">
                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Porta</span>
                            <span className="text-xs font-black text-slate-700 mt-0.5">Porta {client.port}</span>
                          </div>

                          {/* CIRCUITO */}
                          <div className="bg-amber-50/40 border border-amber-100/50 rounded-xl p-2.5 flex flex-col justify-center">
                            <span className="text-[9px] uppercase font-black text-amber-500/70 tracking-wider">Circuito</span>
                            <span className="text-xs font-black text-amber-700 font-mono mt-0.5">{client.circuit || 'Não informado'}</span>
                          </div>

                          {/* BAIRRO */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex flex-col justify-center">
                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Bairro</span>
                            <span className="text-xs font-bold text-slate-700 mt-0.5 truncate" title={client.address.neighborhood}>
                              {client.address.neighborhood || 'Não informado'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${client.address.street}, ${client.address.number}, ${client.address.neighborhood}, ${client.address.city}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 md:flex-none flex items-center justify-center gap-3 px-6 py-3.5 bg-white border-2 border-slate-100 rounded-2xl text-slate-900 font-black text-[10px] uppercase tracking-widest hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-sm active:scale-95"
                      >
                        <Navigation className="w-4 h-4" />
                        Abrir GPS
                      </a>
                      <button
                        onClick={() => handleRemoveFromQueue(client)}
                        className="p-4 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-2xl border-2 border-transparent hover:border-red-100 active:scale-95"
                        title="Remover da fila"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-100"
            >
              <div className="flex items-center gap-5 mb-6">
                <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600">
                  <HelpCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Finalizar Fila?</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Confirmar visitas de hoje</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-sm font-bold text-slate-600 bg-slate-50 p-4 rounded-2xl">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Atualizar data para {new Date().toLocaleDateString('pt-BR')}
                </div>
                <div className="flex items-center gap-3 text-sm font-bold text-slate-600 bg-slate-50 p-4 rounded-2xl">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                  Registrar {auth.currentUser?.displayName || auth.currentUser?.email} como técnico
                </div>
                <div className="flex items-center gap-3 text-sm font-bold text-slate-600 bg-slate-50 p-4 rounded-2xl">
                  <div className="w-2 h-2 bg-amber-500 rounded-full" />
                  Remover {queue.length} clientes da fila
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-4 text-slate-400 font-black text-xs uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleCompleteAllVisits}
                  className="flex-2 py-4 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 active:scale-95"
                >
                  SIM, FINALIZAR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Helper Card */}
      <div className="relative overflow-hidden bg-indigo-900 rounded-[2rem] p-8 md:p-10 text-white shadow-2xl shadow-indigo-200">
        <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
          <Activity className="w-32 h-32" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center shrink-0 border border-white/20">
            <AlertCircle className="w-8 h-8 text-indigo-200" />
          </div>
          <div>
            <h4 className="text-lg font-black uppercase tracking-tight mb-2">Dica de Produtividade</h4>
            <p className="text-indigo-100 text-sm font-medium leading-relaxed max-w-2xl opacity-80 uppercase tracking-wide">
              A fila é redefinida automaticamente quando você confirma as visitas. Clientes visitados nos últimos 30 dias não podem ser adicionados novamente para evitar redundância.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
