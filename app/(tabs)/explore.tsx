import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { useSession } from '@/services/auth-service';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type ProfileView = 'profile' | 'contacts' | 'scanner';

const CONTACTS = [
  { name: 'Ana Hawkins', institution: 'LCH Temuco', followsBack: true, image: require('@/assets/profile/contact-ana.jpeg') },
  { name: 'Carla Álvarez', institution: 'DLS Temuco', followsBack: true, image: require('@/assets/profile/contact-carla.jpeg') },
  { name: 'Rainero Filiberto', institution: 'LCH Temuco', followsBack: true, image: require('@/assets/profile/contact-rainero.jpeg') },
  { name: 'Mila Valentino', institution: 'LPN Temuco', followsBack: false, image: require('@/assets/profile/contact-mila.jpeg') },
  { name: 'Cruz Edison', institution: 'LTB Temuco', followsBack: true, image: require('@/assets/profile/contact-cruz.jpeg') },
  { name: 'Cruz Teobaldo', institution: 'LCH Temuco', followsBack: true, image: require('@/assets/profile/contact-teobaldo.jpeg') },
  { name: 'Leonel Nelson', institution: 'LTB Temuco', followsBack: true, image: require('@/assets/profile/contact-leonel.jpeg') },
] as const;

export default function ProfileScreen() {
  const { user } = useSession();
  const [view, setView] = useState<ProfileView>('profile');
  const [showQr, setShowQr] = useState(false);
  const displayName = useMemo(() => user?.displayName?.trim() || 'Martín Ávila', [user?.displayName]);

  const shareProfile = async () => {
    await Share.share({ message: `Mira el perfil de ${displayName} en HaNet.` });
  };

  if (view === 'contacts') {
    return <ContactsView onBack={() => setView('profile')} onScan={() => setView('scanner')} onShowQr={() => { setShowQr(true); setView('profile'); }} onShare={shareProfile} />;
  }

  if (view === 'scanner') {
    return <ScannerView onBack={() => setView('contacts')} onShowQr={() => { setShowQr(true); setView('profile'); }} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <HanetIdMark />
          <IconButton label="Compartir perfil" icon="share-outline" onPress={shareProfile} />
        </View>

        <View style={styles.identityCard}>
          <Image source={require('@/assets/profile/profile-photo.jpeg')} style={[styles.profilePhoto, showQr && styles.profilePhotoQr]} contentFit="cover" accessibilityLabel={`Foto de perfil de ${displayName}`} />
          {showQr && (
            <View style={styles.qrWrap} accessibilityLabel="Código HaNet QR personal">
              <Image source={require('@/assets/profile/hanet-qr.png')} style={styles.qrImage} contentFit="contain" />
            </View>
          )}
          <View style={[styles.dragHandle, showQr && styles.dragHandleQr]} />
          <View style={styles.identityInfo}>
            <ThemedText style={styles.name}>{displayName}</ThemedText>
            <ThemedText style={styles.institution}>Liceo Camilo Henríquez</ThemedText>
            <ThemedText style={styles.detail}>Segundo Medio K</ThemedText>
            <ThemedText style={styles.detail}>Directiva · HaNet Developer</ThemedText>
            <ThemedText style={styles.accountAge}>En HaNet desde febrero de 2026</ThemedText>
          </View>
        </View>

        <View style={styles.actionPanel}>
          <ProfileAction label="Compartir" icon="share-outline" selected={false} onPress={shareProfile} />
          <ProfileAction label="Editar" icon="pencil-outline" selected={false} onPress={() => Alert.alert('Editar perfil', 'La edición se conectará cuando implementemos los datos reales de HaNet ID.')} />
          <ProfileAction label="Mi HN-QR" icon="qr-code-outline" selected={showQr} onPress={() => setShowQr(value => !value)} />
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Ver institución vinculada" style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]} onPress={() => Alert.alert('Institución vinculada', 'Liceo Camilo Henríquez · Temuco')}>
          <View style={styles.avatarCount}><ThemedText style={styles.avatarCountText}>+1239</ThemedText></View>
          <View style={styles.linkCopy}>
            <ThemedText style={styles.linkEyebrow}>Vinculado a</ThemedText>
            <ThemedText style={styles.linkTitle}>Liceo Camilo Henríquez</ThemedText>
          </View>
          <CustomIcon name="chevron-right" size={20} color={AppColors.textSecondary} />
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Ver lista de contactos" style={({ pressed }) => [styles.contactsCard, pressed && styles.pressed]} onPress={() => setView('contacts')}>
          <View style={styles.contactFaces}>
            <Image source={CONTACTS[0].image} style={styles.face} contentFit="cover" />
            <Image source={CONTACTS[1].image} style={[styles.face, styles.faceOverlap]} contentFit="cover" />
          </View>
          <View style={styles.linkCopy}>
            <ThemedText style={styles.contactsEyebrow}>Tienes 45 contactos</ThemedText>
            <ThemedText style={styles.contactsTitle}>Ver lista de contactos</ThemedText>
          </View>
          <CustomIcon name="chevron-right" size={20} color={AppColors.textOnLight} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactsView({ onBack, onScan, onShowQr, onShare }: { onBack: () => void; onScan: () => void; onShowQr: () => void; onShare: () => void }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Mi lista de contactos" onBack={onBack} />
        <View style={styles.contactActions}>
          <WideAction label="Importar contactos" icon="download-outline" onPress={() => Alert.alert('Importar contactos', 'Esta función se conectará cuando definamos los permisos y la fuente de contactos.')} />
          <WideAction label="Compartir mi perfil" icon="share-outline" onPress={onShare} />
        </View>
        <View style={styles.contactsList} accessibilityLabel="Contactos de demostración">
          {CONTACTS.map(contact => <ContactRow key={contact.name} {...contact} />)}
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.loadMore, pressed && styles.pressed]} onPress={() => Alert.alert('Contactos', 'No hay más contactos de demostración.')}>
            <ThemedText style={styles.loadMoreText}>Cargar más</ThemedText>
          </Pressable>
        </View>
        <View style={styles.qrActions}>
          <ProfileAction label="Mi HaNet QR" icon="qr-code-outline" selected={false} onPress={onShowQr} />
          <ProfileAction label="Escanear" icon="scan-outline" selected={false} onPress={onScan} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ScannerView({ onBack, onShowQr }: { onBack: () => void; onShowQr: () => void }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Mi lista de contactos" onBack={onBack} />
        <View style={styles.scannerHint}><ThemedText style={styles.scannerHintText}>Escanea un HaNet QR y aparecerá aquí</ThemedText></View>
        <View style={styles.scannerCard}>
          <View style={styles.scannerViewport} accessibilityLabel="Vista previa del escáner HaNet QR">
            <View style={[styles.scanCorner, styles.scanTopLeft]} />
            <View style={[styles.scanCorner, styles.scanTopRight]} />
            <View style={[styles.scanCorner, styles.scanBottomLeft]} />
            <View style={[styles.scanCorner, styles.scanBottomRight]} />
            <Ionicons name="camera-outline" size={26} color={AppColors.textSecondary} />
          </View>
          <View style={styles.scannerActions}>
            <ProfileAction label="Mi HaNet QR" icon="qr-code-outline" selected={false} onPress={onShowQr} />
            <ProfileAction label="Escanear" icon="scan-outline" selected onPress={() => Alert.alert('Cámara no conectada', 'La interfaz está lista; conectaremos la cámara y sus permisos en una fase posterior.')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HanetIdMark() {
  return <View style={styles.brand}><View style={styles.brandFlag}><View style={styles.brandFlagTip} /></View><ThemedText style={styles.brandName}>HaNet</ThemedText><ThemedText style={styles.brandId}>ID</ThemedText></View>;
}

function IconButton({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Ionicons name={icon} size={20} color={AppColors.textPrimary} /></Pressable>;
}

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.sectionHeader}><IconButton label="Volver al perfil" icon="arrow-back" onPress={onBack} /><ThemedText style={styles.sectionHeaderTitle}>{title}</ThemedText><IconButton label="Opciones de contactos" icon="menu" onPress={() => Alert.alert('Opciones', 'Los filtros se habilitarán junto con los contactos reales.')} /></View>;
}

function ProfileAction({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.profileAction, selected && styles.profileActionSelected, pressed && styles.pressed]}><Ionicons name={icon} size={23} color={selected ? AppColors.controlOnActive : AppColors.textPrimary} /><ThemedText style={[styles.profileActionText, selected && styles.profileActionTextSelected]}>{label}</ThemedText></Pressable>;
}

function WideAction({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.wideAction, pressed && styles.pressed]}><ThemedText style={styles.wideActionText}>{label}</ThemedText><Ionicons name={icon} size={19} color={AppColors.textPrimary} /></Pressable>;
}

function ContactRow({ name, institution, followsBack, image }: (typeof CONTACTS)[number]) {
  return <View style={styles.contactRow}><Image source={image} style={styles.contactAvatar} contentFit="cover" accessibilityLabel={`Foto de ${name}`} /><View style={styles.contactCopy}><ThemedText style={styles.contactName}>{name}</ThemedText><ThemedText style={styles.contactInstitution}>{institution} ({followsBack ? 'Te sigue' : 'No te sigue'})</ThemedText></View><Pressable accessibilityRole="button" accessibilityState={{ selected: followsBack }} style={[styles.followChip, !followsBack && styles.followChipPending]} onPress={() => Alert.alert(name, 'El estado de contacto se conectará a HaNet ID posteriormente.')}><ThemedText style={[styles.followText, !followsBack && styles.followTextPending]}>{followsBack ? 'Siguiendo' : 'Pendiente'}</ThemedText></Pressable></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.canvas },
  page: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingBottom: 150, gap: AppSpacing.md },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandFlag: { width: 9, height: 26, backgroundColor: AppColors.accent, marginRight: 8 },
  brandFlagTip: { position: 'absolute', right: -8, top: 8, width: 9, height: 10, backgroundColor: AppColors.accent, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  brandName: { color: AppColors.textPrimary, fontFamily: 'DMSans_500Medium', fontSize: 18 },
  brandId: { color: AppColors.textSecondary, fontFamily: 'DMSans_400Regular', fontSize: 11, marginLeft: 4, alignSelf: 'flex-end', marginBottom: 4 },
  iconButton: { minWidth: AppTouch.minimum, height: AppTouch.minimum, borderRadius: AppRadii.pill, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },
  identityCard: { minHeight: 570, borderRadius: 30, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: AppColors.surfaceSoft },
  profilePhoto: { width: '100%', height: 356, backgroundColor: AppColors.surfaceMuted, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  profilePhotoQr: { height: 30, opacity: 0.72 },
  qrWrap: { height: 326, alignItems: 'center', justifyContent: 'center', paddingTop: 16 },
  qrImage: { width: 246, height: 246 },
  dragHandle: { position: 'absolute', top: 365, alignSelf: 'center', width: 45, height: 4, borderRadius: AppRadii.pill, backgroundColor: AppColors.textOnLight },
  dragHandleQr: { top: 38 },
  identityInfo: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 24 },
  name: { color: AppColors.textOnLight, fontSize: 34, lineHeight: 41, letterSpacing: -1.7, fontFamily: 'DMSans_500Medium' },
  institution: { color: AppColors.textOnLight, fontSize: 15, lineHeight: 19, fontFamily: 'DMSans_500Medium' },
  detail: { color: AppColors.textOnLight, fontSize: 13, lineHeight: 16, opacity: 0.82 },
  accountAge: { color: AppColors.textOnLight, fontSize: 13, lineHeight: 17, opacity: 0.58, marginTop: 4 },
  actionPanel: { flexDirection: 'row', gap: AppSpacing.sm, padding: AppSpacing.sm, borderRadius: AppRadii.xl, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  profileAction: { flex: 1, minHeight: 118, borderRadius: AppRadii.lg, borderCurve: 'continuous', backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 8 },
  profileActionSelected: { backgroundColor: AppColors.controlActive },
  profileActionText: { color: AppColors.textPrimary, fontFamily: 'DMSans_500Medium', fontSize: 14, textAlign: 'center' },
  profileActionTextSelected: { color: AppColors.controlOnActive, fontFamily: 'DMSans_700Bold' },
  linkCard: { minHeight: 88, paddingHorizontal: AppSpacing.lg, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, backgroundColor: AppColors.surface, borderRadius: AppRadii.xl, borderCurve: 'continuous' },
  avatarCount: { minWidth: 54, height: 40, borderRadius: AppRadii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.controlActive },
  avatarCountText: { color: AppColors.controlOnActive, fontSize: 11, fontFamily: 'DMSans_700Bold' },
  linkCopy: { flex: 1 },
  linkEyebrow: { color: AppColors.textSecondary, fontSize: 12 },
  linkTitle: { color: AppColors.textPrimary, fontSize: 15, fontFamily: 'DMSans_700Bold' },
  contactsCard: { minHeight: 92, paddingHorizontal: AppSpacing.lg, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, backgroundColor: AppColors.accent, borderRadius: AppRadii.xl, borderCurve: 'continuous' },
  contactFaces: { width: 64, flexDirection: 'row' },
  face: { width: 40, height: 40, borderRadius: AppRadii.pill, borderWidth: 2, borderColor: AppColors.accent },
  faceOverlap: { marginLeft: -14 },
  contactsEyebrow: { color: AppColors.textOnLight, fontSize: 12 },
  contactsTitle: { color: AppColors.textOnLight, fontSize: 15, fontFamily: 'DMSans_700Bold' },
  sectionHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderTitle: { color: AppColors.textPrimary, fontSize: 20, lineHeight: 28, fontFamily: 'DMSans_500Medium', textAlign: 'center' },
  contactActions: { gap: AppSpacing.sm, paddingVertical: AppSpacing.lg },
  wideAction: { minHeight: 50, borderRadius: AppRadii.pill, backgroundColor: AppColors.primary, paddingHorizontal: AppSpacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wideActionText: { color: AppColors.textPrimary, fontSize: 16, fontFamily: 'DMSans_700Bold' },
  contactsList: { gap: AppSpacing.md, padding: AppSpacing.lg, borderRadius: AppRadii.xl, borderCurve: 'continuous', backgroundColor: AppColors.surface },
  contactRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  contactAvatar: { width: 48, height: 56, borderRadius: AppRadii.sm, backgroundColor: AppColors.surfaceMuted },
  contactCopy: { flex: 1, minWidth: 0 },
  contactName: { color: AppColors.textPrimary, fontSize: 17, lineHeight: 23, fontFamily: 'DMSans_500Medium' },
  contactInstitution: { color: AppColors.textSecondary, fontSize: 11, lineHeight: 16, opacity: 0.58 },
  followChip: { minHeight: 34, minWidth: 76, borderRadius: AppRadii.pill, borderWidth: 1, borderColor: AppColors.textSecondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  followChipPending: { backgroundColor: AppColors.controlActive, borderColor: AppColors.controlActive },
  followText: { color: AppColors.textPrimary, fontSize: 10, fontFamily: 'DMSans_500Medium' },
  followTextPending: { color: AppColors.controlOnActive },
  loadMore: { minHeight: AppTouch.minimum, borderRadius: AppRadii.pill, borderWidth: 1, borderColor: AppColors.textSecondary, alignItems: 'center', justifyContent: 'center', marginTop: AppSpacing.sm },
  loadMoreText: { color: AppColors.textPrimary, fontSize: 12, fontFamily: 'DMSans_500Medium' },
  qrActions: { flexDirection: 'row', gap: AppSpacing.sm, padding: AppSpacing.sm, borderRadius: AppRadii.xl, backgroundColor: AppColors.surface },
  scannerHint: { minHeight: 96, paddingHorizontal: AppSpacing.xl, borderRadius: AppRadii.xl, backgroundColor: AppColors.surface, alignItems: 'center', justifyContent: 'center' },
  scannerHintText: { color: AppColors.textPrimary, fontSize: 16, lineHeight: 24, fontFamily: 'DMSans_700Bold', textAlign: 'center' },
  scannerCard: { padding: AppSpacing.md, borderRadius: AppRadii.xl, backgroundColor: AppColors.surface, gap: AppSpacing.md },
  scannerViewport: { height: 470, borderRadius: AppRadii.lg, backgroundColor: AppColors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  scanCorner: { position: 'absolute', width: 48, height: 48, borderColor: AppColors.textSecondary, opacity: 0.48 },
  scanTopLeft: { left: 48, top: 100, borderLeftWidth: 8, borderTopWidth: 8, borderTopLeftRadius: 8 },
  scanTopRight: { right: 48, top: 100, borderRightWidth: 8, borderTopWidth: 8, borderTopRightRadius: 8 },
  scanBottomLeft: { left: 48, bottom: 100, borderLeftWidth: 8, borderBottomWidth: 8, borderBottomLeftRadius: 8 },
  scanBottomRight: { right: 48, bottom: 100, borderRightWidth: 8, borderBottomWidth: 8, borderBottomRightRadius: 8 },
  scannerActions: { flexDirection: 'row', gap: AppSpacing.sm },
  pressed: { opacity: 0.72 },
});
