import { EventEmitter } from 'events';

const g = global as typeof globalThis & {
  _boardEmitter?: EventEmitter;
};

if (!g._boardEmitter) {
  g._boardEmitter = new EventEmitter();
  g._boardEmitter.setMaxListeners(100);
}

export const boardEmitter: EventEmitter = g._boardEmitter;

export const BOARD_UPDATE_EVENT = 'board-update';
