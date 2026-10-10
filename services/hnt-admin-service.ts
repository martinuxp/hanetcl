import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type AdminInstitution = {
  id: string;
  name: string;
  fullName: string;
  rosterCount: number;
  hasInviteCode: boolean;
  inviteUpdatedAt: number | null;
};

export type RosterRow = {
  rut: string;
  nombres: string;
  apellidos: string;
  curso: string;
  email: string;
};

export type RosterImportResult = {
  imported: number;
  rejected: { row: number; reason: string }[];
  rejectedCount: number;
};

export const MEMBER_ROLES = ['Estudiante', 'Directiva', 'CEE', 'Profesor', 'Admin', 'HNT'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export type Member = {
  rut: string;
  fullName: string;
  curso: string;
  email: string;
  /** Null while the person has not linked their HaNet ID. */
  uid: string | null;
  role: MemberRole | null;
};

export async function listMembers(institutionId: string) {
  const result = await httpsCallable<{ institutionId: string }, { members: Member[]; truncated: boolean }>(functions, 'adminListMembers')({ institutionId });
  return result.data;
}

export async function setMemberRole(uid: string, role: MemberRole) {
  await httpsCallable(functions, 'adminSetRole')({ uid, role });
}

export async function unlinkMember(uid: string) {
  await httpsCallable(functions, 'adminUnlinkMember')({ uid });
}

/** Ties the caller's own, hand-made profile to an institution. */
export async function joinInstitution(institutionId: string) {
  await httpsCallable(functions, 'adminJoinInstitution')({ institutionId });
}

export async function listInstitutions() {
  const result = await httpsCallable<void, { institutions: AdminInstitution[] }>(functions, 'adminListInstitutions')();
  return result.data.institutions;
}

export async function createInstitution(name: string, fullName: string) {
  const result = await httpsCallable<{ name: string; fullName: string }, { id: string }>(functions, 'adminCreateInstitution')({ name, fullName });
  return result.data.id;
}

/** Returns the new phrase. The backend keeps only its hash, so this is the one chance to read it. */
export async function rotateInviteCode(institutionId: string) {
  const result = await httpsCallable<{ institutionId: string }, { words: string[] }>(functions, 'adminRotateInviteCode')({ institutionId });
  return result.data.words;
}

export async function importRoster(institutionId: string, rows: RosterRow[]) {
  const result = await httpsCallable<{ institutionId: string; rows: RosterRow[] }, RosterImportResult>(functions, 'adminImportRoster')({ institutionId, rows });
  return result.data;
}

/**
 * Reads a roster pasted from a spreadsheet: one person per line, columns
 * RUT, nombres, apellidos, curso, correo. `headerRows` tells how many leading
 * lines were skipped, to report problems with the sheet's own row numbers.
 */
export function parseRoster(text: string): { rows: RosterRow[]; headerRows: number } {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], headerRows: 0 };

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const table = lines.map(line => line.split(delimiter).map(cell => cell.trim()));
  // A first row whose RUT column has no digits is the sheet's header.
  const headerRows = /\d/.test(table[0][0] ?? '') ? 0 : 1;

  const rows = table.slice(headerRows).map(cells => ({
    rut: cells[0] ?? '',
    nombres: cells[1] ?? '',
    apellidos: cells[2] ?? '',
    curso: cells[3] ?? '',
    email: cells[4] ?? '',
  }));
  return { rows, headerRows };
}
