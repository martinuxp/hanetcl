export type IdentityLinkStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'revoked';

export interface IdentityLinkRequest {
  requestId: string;
  firebaseUid: string;
  rut: string;
  institutionId?: string;
  academicStudentId?: string;
  moodleUserId?: string;
  status: IdentityLinkStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}
