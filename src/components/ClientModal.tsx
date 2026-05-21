import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, query, getDocs, where, doc, serverTimestamp, setDoc, updateDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { X, Save, Users, CreditCard, Box, Loader2, Search, MapPin, Calendar, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Client, CTO, OperationType } from '../types';
import { fetchAddressByCep } from '../services/addressService';
import { cn } from '../lib/utils';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: Client;
}

export function ClientModal({ isOpen, onClose, client }: ClientModalProps) {
  const [ctos, setCtos] = useState<CTO[]>([]);
  const [loadingCtos, setLoadingCtos] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    port: 1,
    circuit: '',
    ctoId: '',
    status: 'Ativo',
    lastMaintenanceDate: null as any,
    address: {
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: ''
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [errorMessage, setErrorMessage] = useState<{title: string, message: string, type: 'error' | 'warning' | 'migration', existingClient?: any} | null>(null);

  useEffect(() => {
    if (!auth.currentUser || !isOpen) return;

    // Load CTOs for selection in real-time
    setLoadingCtos(true);
    setErrorMessage(null);
    const q = query(collection(db, 'ctos'), orderBy('name', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      setCtos(snap.docs.map(d => ({ id: d.id, ...d.data() } as CTO)));
      setLoadingCtos(false);
    }, (error) => {
      console.error("Erro ao carregar CTOs no ClientModal (onSnapshot):", error);
      setLoadingCtos(false);
    });

    if (client) {
      setFormData({
        name: client.name,
        cpf: client.cpf,
        port: client.port,
        circuit: client.circuit,
        ctoId: client.ctoId,
        status: client.status || 'Ativo',
        lastMaintenanceDate: client.lastMaintenanceDate || null,
        address: client.address
      });
    } else {
      setFormData({
        name: '',
        cpf: '',
        port: 1,
        circuit: '',
        ctoId: '',
        status: 'Ativo',
        lastMaintenanceDate: null,
        address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '' }
      });
    }

    return () => {
      unsubscribe();
    };
  }, [client, isOpen]);

  const handleCepBlur = async () => {
    const cep = formData.address.cep.replace(/\D/g, '');
    if (cep.length === 8) {
      setFetchingCep(true);
      const addr = await fetchAddressByCep(cep);
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          ...addr,
          cep,
          number: prev.address.number // preserve number
        } as any
      }));
      setFetchingCep(false);
    }
  };

  const handleMigrate = async (existingClient: Client) => {
    if (!auth.currentUser) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'clients', existingClient.id), {
        ...formData,
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${existingClient.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth.currentUser || !formData.ctoId) return;

    // 1. CPF Validation
    if (formData.cpf.length !== 11) {
      setErrorMessage({
        title: 'CPF Inválido',
        message: 'O CPF precisa ter exatamente 11 dígitos numéricos.',
        type: 'error'
      });
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      // 2. Check for port occupancy
      const qPort = query(
        collection(db, 'clients'),
        where('ctoId', '==', formData.ctoId),
        where('port', '==', formData.port)
      );
      const snapPort = await getDocs(qPort);
      const isOccupiedByOther = snapPort.docs.some(d => d.id !== client?.id);

      if (isOccupiedByOther) {
        setErrorMessage({
          title: 'Porta Ocupada',
          message: `A porta ${formData.port} desta CTO já está em uso por outro cliente.`,
          type: 'error'
        });
        setSubmitting(false);
        return;
      }

      // 3. Check for Duplicate CPF (only if not migration and not editing existing)
      if (!client) {
        const qCpf = query(
          collection(db, 'clients'),
          where('cpf', '==', formData.cpf)
        );
        const snapCpf = await getDocs(qCpf);
        if (!snapCpf.empty) {
          const existing = snapCpf.docs[0].data() as Client;
          const cto = ctos.find(c => c.id === existing.ctoId);
          setErrorMessage({
            title: 'CPF já cadastrado',
            message: `O CPF digitado já foi cadastrado na CTO: ${cto?.name || 'Não informada'}.`,
            type: 'migration',
            existingClient: { ...existing, id: snapCpf.docs[0].id }
          });
          setSubmitting(false);
          return;
        }
      }

      // 4. Check for Duplicate Circuit
      const qCircuit = query(
        collection(db, 'clients'),
        where('circuit', '==', formData.circuit)
      );
      const snapCircuit = await getDocs(qCircuit);
      const duplicateCircuit = snapCircuit.docs.find(d => d.id !== client?.id);
      if (duplicateCircuit) {
        const existing = duplicateCircuit.data() as Client;
        const cto = ctos.find(c => c.id === existing.ctoId);
        setErrorMessage({
          title: 'Circuito já cadastrado',
          message: `O circuito digitado já possui cadastro na CTO: ${cto?.name || 'Não informada'}.`,
          type: 'error'
        });
        setSubmitting(false);
        return;
      }

      const clientData = {
        ...formData,
        updatedAt: serverTimestamp(),
      };

      if (client) {
        await updateDoc(doc(db, 'clients', client.id), clientData);
      } else {
        const newDocRef = doc(collection(db, 'clients'));
        await setDoc(newDocRef, {
          ...clientData,
          id: newDocRef.id,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, client ? OperationType.UPDATE : OperationType.CREATE, client ? `clients/${client.id}` : 'clients');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
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
            className="relative w-[95%] sm:w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6 lg:p-8 overflow-y-auto max-h-[90vh] border border-slate-100"
          >
            <div className="flex items-center justify-between mb-8 lg:mb-10">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-600 p-3 rounded-xl text-white shadow-lg shadow-indigo-200">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {client ? 'Atualizar Assinante' : 'Novo Assinante de Rede'}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium tracking-tight">Gerencie os detalhes do cliente e pontos de acesso.</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                id="close-client-modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {errorMessage && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={cn(
                    "p-4 rounded-xl border flex items-start gap-4",
                    errorMessage.type === 'error' ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-lg shrink-0",
                    errorMessage.type === 'error' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                  )}>
                    <Loader2 className={cn("w-5 h-5", submitting && "animate-spin")} />
                  </div>
                  <div className="flex-1">
                    <p className={cn("text-xs font-bold uppercase tracking-widest mb-1", errorMessage.type === 'error' ? "text-red-900" : "text-amber-900")}>
                      {errorMessage.title}
                    </p>
                    <p className={cn("text-xs leading-relaxed", errorMessage.type === 'error' ? "text-red-700" : "text-amber-700")}>
                      {errorMessage.message}
                    </p>
                    
                    {errorMessage.type === 'migration' && (
                      <div className="mt-4 flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => handleMigrate(errorMessage.existingClient)}
                          disabled={submitting}
                          className="px-4 py-2 bg-amber-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-2"
                        >
                          Deseja migrar para essa CTO?
                        </button>
                        <button
                          type="button"
                          onClick={() => setErrorMessage(null)}
                          className="px-4 py-2 bg-white border border-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-amber-50 transition-all"
                        >
                          Corrigir CPF
                        </button>
                      </div>
                    )}
                  </div>
                  {errorMessage.type !== 'migration' && (
                    <button type="button" onClick={() => setErrorMessage(null)} className="p-1 text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              )}

              {!loadingCtos && ctos.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-4">
                  <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                    <Box className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900 leading-none mb-1">Nenhuma CTO Disponível</p>
                    <p className="text-xs text-amber-700 leading-relaxed">Você precisa cadastrar pelo menos uma CTO antes de adicionar clientes à sua rede.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Identificação Pessoal</h3>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">CPF (11 dígitos, obrigatório)</label>
                    <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input
                        required
                        type="text"
                        maxLength={11}
                        value={formData.cpf}
                        onChange={(e) => setFormData({ ...formData, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                        placeholder="Somente números"
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Alocação de Rede</h3>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Caixa CTO Vinculada</label>
                    <div className="relative">
                      <Box className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <select
                        required
                        disabled={ctos.length === 0}
                        value={formData.ctoId}
                        onChange={(e) => setFormData({ ...formData, ctoId: e.target.value })}
                        className="w-full pl-11 pr-10 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none appearance-none font-bold text-slate-700 disabled:opacity-50"
                      >
                        <option value="">{loadingCtos ? 'Carregando CTOs...' : 'Selecione...'}</option>
                        {ctos.map(cto => (
                          <option key={cto.id} value={cto.id}>{cto.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Porta</label>
                      <input
                        required
                        type="number"
                        min="1"
                        value={formData.port}
                        onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none font-bold text-indigo-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Circuito (máx 12)</label>
                      <input
                        required
                        type="text"
                        maxLength={12}
                        value={formData.circuit}
                        onChange={(e) => setFormData({ ...formData, circuit: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                        placeholder="Somente números"
                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5 pt-8 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Localização e Endereço</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">CEP (Somente números)</label>
                    <div className="relative">
                      <Search className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300", fetchingCep && "animate-pulse text-indigo-500")} />
                      <input
                        required
                        type="text"
                        value={formData.address.cep}
                        onChange={(e) => setFormData({ ...formData, address: { ...formData.address, cep: e.target.value.replace(/\D/g, '') } })}
                        onBlur={handleCepBlur}
                        placeholder="00000000"
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none font-bold text-slate-600"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Logradouro / Rua</label>
                    <input
                      required
                      type="text"
                      value={formData.address.street}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })}
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Número (Somente números)</label>
                    <input
                      required
                      type="text"
                      value={formData.address.number}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value.replace(/\D/g, '') } })}
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none font-extrabold text-indigo-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                    <input
                      required
                      type="text"
                      value={formData.address.neighborhood}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, neighborhood: e.target.value } })}
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cidade</label>
                    <input
                      required
                      type="text"
                      value={formData.address.city}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })}
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                    <input
                      required
                      type="text"
                      value={formData.address.state}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })}
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-5 pt-8 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Manutenção</h3>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Última Visita Técnica</label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input
                        type="date"
                        value={formData.lastMaintenanceDate ? (formData.lastMaintenanceDate.seconds ? new Date(formData.lastMaintenanceDate.seconds * 1000).toISOString().split('T')[0] : formData.lastMaintenanceDate) : ''}
                        onChange={(e) => setFormData({ ...formData, lastMaintenanceDate: e.target.value })}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none font-bold text-slate-600"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, lastMaintenanceDate: new Date().toISOString().split('T')[0] })}
                      className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
                      title="Atualizar para Hoje"
                    >
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Hoje</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-8 flex gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || ctos.length === 0}
                  className="flex-2 py-4 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none shadow-lg shadow-indigo-100"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {client ? 'Efetivar Alterações' : 'Concluir Cadastro'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
