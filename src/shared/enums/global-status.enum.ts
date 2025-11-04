export enum GlobalStatus {
  CREATED = 'created',
  STARTED = 'started',
  STOPPED = 'stopped',
  CANCELED = 'canceled',
  COMPLETED = 'completed',
  DELETED = 'deleted',
  PENDING = 'pending',
  INIT = 'init',
}

export interface GlobalStatusCount {
  CREATED: number;
  INIT: number;
  STARTED: number;
  COMPLETED: number;
  CANCELED: number;
  PENDING: number;
  STOPPED: number;
}
