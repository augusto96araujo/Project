export interface Address {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CTO {
  id: string;
  name: string;
  location: string;
  address?: Address;
  capacity: number;
  createdBy: string;
  createdAt: any;
  updatedAt?: any;
}

export interface Client {
  id: string;
  name: string;
  cpf: string;
  port: number;
  circuit: string;
  address: Address;
  ctoId: string;
  status?: string;
  inWaitingQueue?: boolean;
  inWaitingQueueBy?: string;
  inWaitingQueueByName?: string;
  addedToQueueAt?: any;
  lastMaintenanceDate?: any;
  lastMaintenanceByName?: string;
  createdBy: string;
  createdAt: any;
  updatedAt?: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}
