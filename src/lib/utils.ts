import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMaintenanceStatus(lastDate?: any) {
  if (!lastDate) return { text: 'Nunca visitado', isRed: false, days: null, color: 'bg-slate-300', formattedDate: 'N/A' };
  
  let maintenanceDate: Date;
  if (lastDate && typeof lastDate === 'object' && 'seconds' in lastDate) {
    maintenanceDate = new Date(lastDate.seconds * 1000);
  } else {
    maintenanceDate = new Date(lastDate);
  }

  // Check if date is valid
  if (isNaN(maintenanceDate.getTime())) {
    return { text: 'Data inválida', isRed: false, days: null, color: 'bg-slate-300', formattedDate: 'Erro' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(maintenanceDate);
  compareDate.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - compareDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Logic: Red (Restricted) if visit was less than 30 days ago
  const isRed = diffDays < 30 && diffDays >= 0;
  
  return { 
    text: diffDays === 0 ? 'Visitado hoje' : diffDays < 0 ? 'Visita futura' : `Última visita há ${diffDays} dias`, 
    isRed, 
    days: diffDays, 
    color: isRed ? 'bg-red-500' : 'bg-green-500',
    formattedDate: maintenanceDate.toLocaleDateString('pt-BR')
  };
}
