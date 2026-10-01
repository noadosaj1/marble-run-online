import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/constants';

/** Short, unambiguous, unique-among-active-rooms code. Grows if the space gets crowded. */
export function generateRoomCode(isTaken: (code: string) => boolean): string {
  for (let length = ROOM_CODE_LENGTH; length <= 6; length++) {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < length; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!isTaken(code)) return code;
    }
  }
  throw new Error('Unable to allocate a room code');
}
