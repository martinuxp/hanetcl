import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// The door (validateTicket, checkInEventAttendee) runs in Santiago, next to
// the database, like every other function since the move (functions/regions.js).
// A scan gives up after 15 s so the scanner can say so instead of hanging.
export async function doorCall<In, Out>(name: string, input: In): Promise<Out> {
  return (await httpsCallable<In, Out>(functions, name, { timeout: 15_000 })(input)).data;
}

/**
 * Wakes the door's function when the scanner opens and leaves who scans and
 * the event ready on the server, so the first scan is as fast as the rest.
 * Answers the count so far; never throws.
 */
export async function warmDoor<Out>(name: string, input: Record<string, unknown>): Promise<Out | null> {
  try {
    return await doorCall<Record<string, unknown>, Out>(name, { ...input, warm: true });
  } catch {
    return null;
  }
}
