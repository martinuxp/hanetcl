import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { cached } from './cache';
import { functions, storage } from './firebase';

// One photo per account. The storage rules only let its owner read or write it.
function photoRef(uid: string) {
  return ref(storage, `profile-photos/${uid}/avatar.jpg`);
}

/** The account's profile photo, or null when it has none. */
export function getProfilePhotoUrl(uid: string): Promise<string | null> {
  return cached(`photo:${uid}`, async () => {
    try {
      return await getDownloadURL(photoRef(uid));
    } catch (error) {
      if ((error as { code?: string }).code === 'storage/object-not-found') return null;
      throw error;
    }
  });
}

/** Opens the photo library. Resolves to null if the person backs out. */
export async function pickProfilePhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  return result.canceled ? null : result.assets[0]?.uri ?? null;
}

export async function uploadProfilePhoto(uid: string, localUri: string): Promise<string> {
  // Phone photos are several megabytes; the profile never shows them larger than this.
  const resized = await manipulateAsync(localUri, [{ resize: { width: 1024 } }], { compress: 0.8, format: SaveFormat.JPEG });
  const blob = await (await fetch(resized.uri)).blob();
  await uploadBytes(photoRef(uid), blob, { contentType: 'image/jpeg' });
  return getDownloadURL(photoRef(uid));
}

export async function removeProfilePhoto(uid: string) {
  try {
    await deleteObject(photoRef(uid));
  } catch (error) {
    if ((error as { code?: string }).code !== 'storage/object-not-found') throw error;
  }
}

/** "Otro": draws a new blobatar for the account; returns its seed. */
export async function newAvatar() {
  const result = await httpsCallable<{ newAvatar: true }, { avatarSeed: string }>(functions, 'updateMyProfile')({ newAvatar: true });
  return result.data.avatarSeed;
}

export async function saveNameFont(nameFont: string) {
  await httpsCallable(functions, 'updateMyProfile')({ nameFont });
}

export function describePhotoError(error: unknown) {
  const code = (error as { code?: string }).code ?? '';
  if (code === 'storage/unauthorized') return 'No tienes permiso para cambiar esta foto.';
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/unknown') return 'No pudimos subir la foto. Revisa tu conexión.';
  return 'No pudimos guardar la foto. Inténtalo nuevamente.';
}
