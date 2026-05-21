import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, doc, serverTimestamp, setDoc, updateDoc, getDocs } from 'firebase/firestore';
import { X, Save, Box, MapPin, Hash, Loader2, Home, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CTO, OperationType, Address } from '../types';

interface CTOModalProps {
  isOpen: boolean;
  onClose: () => void;
  cto?: CTO;
}

export function CTOModal({ isOpen, onClose, cto }: CTOModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    capacity: 16,
    address: {
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: ''
    } as Address
  });
  const [submitting, setSubmitting] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [existingCtos, setExistingCtos] = useState<CTO[]>([]);

  useEffect(() => {
    if (isOpen) {
      getDocs(collection(db, 'ctos'))
        .then(snap => {
          setExistingCtos(snap.docs.map(d => ({ id: d.id, ...d.data() } as CTO)));
        })
        .catch(err => console.error("Erro ao carregar CTOs existentes:", err));
    }
  }, [isOpen]);

  const isDuplicateName = formData.name.trim() !== '' && existingCtos.some(c => 
    (!cto || c.id !== cto.id) && c.name.trim().toLowerCase() === formData.name.trim().toLowerCase()
  );

  useEffect(() => {
    if (cto) {
      setFormData({
        name: cto.name,
        location: cto.location,
        capacity: cto.capacity,
        address: cto.address || {
          cep: '',
          street: '',
          number: '',
          neighborhood: '',
          city: '',
          state: ''
        }
      });
    } else {
      setFormData({
        name: '',
        location: '',
        capacity: 16,
        address: {
          cep: '',
          street: '',
          number: '',
          neighborhood: '',
          city: '',
          state: ''
        }
      });
    }
  }, [cto, isOpen]);

  const handleCepChange = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    setFormData(prev => ({ 
      ...prev, 
      address: { ...prev.address, cep: cep.length > 8 ? cep.substring(0, 9) : cep } 
    }));

    if (cleanCep.length === 8) {
      setLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            address: {
              ...prev.address,
              street: data.logradouro,
              neighborhood: data.bairro,
              city: data.localidade,
              state: data.uf
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching CEP:', error);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (isDuplicateName) return;

    setSubmitting(true);
    try {
      const ctoData = {
        ...formData,
        updatedAt: serverTimestamp(),
      };

      if (cto) {
        await updateDoc(doc(db, 'ctos', cto.id), ctoData);
      } else {
        const newDocRef = doc(collection(db, 'ctos'));
        await setDoc(newDocRef, {
          ...ctoData,
          id: newDocRef.id,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, cto ? OperationType.UPDATE : OperationType.CREATE, cto ? `ctos/${cto.id}` : 'ctos');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            className="relative w-[95%] sm:w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 lg:p-8 overflow-y-auto max-h-[90vh] border border-slate-100"
          >
            <div className="flex items-center justify-between mb-6 lg:mb-8">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-600 p-3 rounded-xl text-white shadow-lg shadow-indigo-200">
                  <Box className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {cto ? 'Editar Unidade CTO' : 'Nova Unidade CTO'}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium tracking-tight">Preencha os dados técnicos da caixa de rede.</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                id="close-cto-modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Technical Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 font-sans">Identificação</label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: CTO-01"
                      className={`w-full pl-9 pr-4 py-3 bg-slate-50 border rounded-xl text-xs focus:ring-2 transition-all outline-none ${
                        isDuplicateName 
                          ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' 
                          : 'border-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white'
                      }`}
                    />
                  </div>
                  {isDuplicateName && (
                    <p className="text-[10px] font-semibold text-red-500 mt-1 ml-1 leading-normal font-sans">
                      Esta CTO já está cadastrada no sistema.
                    </p>
                  )}
                </div>

                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Portas</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="128"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                  />
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <Navigation className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Endereço de Instalação</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">CEP</label>
                    <div className="relative">
                      <input
                        required
                        type="text"
                        value={formData.address.cep}
                        onChange={(e) => handleCepChange(e.target.value)}
                        placeholder="00000-000"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                      />
                      {loadingCep && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Número/Pilar</label>
                    <input
                      required
                      type="text"
                      value={formData.address.number}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value } })}
                      placeholder="Ex: 123"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Rua/Logradouro</label>
                    <div className="relative">
                      <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                      <input
                        required
                        type="text"
                        value={formData.address.street}
                        onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })}
                        placeholder="Rua..."
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Bairro</label>
                    <input
                      required
                      type="text"
                      value={formData.address.neighborhood}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, neighborhood: e.target.value } })}
                      placeholder="Bairro"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Cidade</label>
                    <input
                      required
                      type="text"
                      value={formData.address.city}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })}
                      placeholder="Cidade"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Ponto de Referência</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="Ex: Próximo ao poste..."
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || isDuplicateName}
                  className="flex-3 py-3 bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-100"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {cto ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
