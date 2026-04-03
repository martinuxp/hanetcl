import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, TextInput, TouchableOpacity, Switch, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Colores extraídos del Figma
const COLORS = {
  background: '#fafaf9',
  surfacePrimary: '#252f2c', // Color oscuro para headers o inputs según el figma analizado
  surfaceNeutral2: '#ebebe6', // Gris claro para bordes y pills no seleccionadas
  surfaceNeutral9: '#292927', // Texto principal oscuro
  textMuted: '#a0a09f', // opacity 0.75 approximate
  border: '#ebebe6',
  pillSelectedBg: '#465a54', // Asumiendo este color para el estado seleccionado basado en el branding (verde oscuro)
  pillSelectedText: '#fafaf9',
};

type PillProp = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

const Pill = ({ label, selected, onPress }: PillProp) => (
  <TouchableOpacity
    style={[styles.pill, selected && styles.pillSelected]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <ThemedText style={[styles.pillText, selected && styles.pillSelectedText]}>
      {label}
    </ThemedText>
  </TouchableOpacity>
);

const asignaturas = ['Lengua y Literatura', 'Matemáticas', 'Ingles', 'Tecnologia'];
const tiposEventos = ['Evaluación sumativa', 'Evaluación formativa', 'Tarea', 'Taller formativo', 'Taller evaluado'];

export default function ModalScreen() {
  const router = useRouter();
  
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [solicitarVerificacion, setSolicitarVerificacion] = useState(false);
  const [asignatura, setAsignatura] = useState<string | null>(null);
  const [tipoEvento, setTipoEvento] = useState<string | null>(null);

  const blurMethod = Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : 'none';

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* TÍTULO */}
        <View style={styles.sectionTitle}>
          <TextInput
            style={styles.inputTitle}
            placeholder="Añade un titulo"
            placeholderTextColor={COLORS.textMuted}
            value={titulo}
            onChangeText={setTitulo}
          />
          <View style={styles.divider} />
        </View>

        {/* FECHA Y HORA */}
        <TouchableOpacity style={styles.inputBox} activeOpacity={0.7}>
          <View style={styles.inputBoxContent}>
            <ThemedText style={styles.inputBoxLabel}>Fecha y hora</ThemedText>
            <ThemedText style={styles.inputBoxValue}>12/03/26, 13:45 - 16:30</ThemedText>
          </View>
          <Feather name="clock" size={24} color={COLORS.surfaceNeutral9} />
        </TouchableOpacity>

        {/* UBICACIÓN */}
        <TouchableOpacity style={styles.inputBox} activeOpacity={0.7}>
          <View style={styles.inputBoxContent}>
            <ThemedText style={styles.inputBoxLabel}>Ubicación</ThemedText>
            <ThemedText style={styles.inputBoxValue}>Sala 304-B (P3)</ThemedText>
          </View>
          <Ionicons name="location-outline" size={24} color={COLORS.surfaceNeutral9} />
        </TouchableOpacity>

        {/* ASIGNATURA */}
        <View style={styles.sectionBlock}>
          <ThemedText style={styles.sectionLabel}>Asignatura relacionada</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
            {asignaturas.map((asig) => (
              <Pill
                key={asig}
                label={asig}
                selected={asignatura === asig}
                onPress={() => setAsignatura(asig)}
              />
            ))}
          </ScrollView>
        </View>

        {/* TIPO DE EVENTO */}
        <View style={styles.sectionBlock}>
          <ThemedText style={styles.sectionLabel}>Tipo de evento</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
            {tiposEventos.map((tipo) => (
              <Pill
                key={tipo}
                label={tipo}
                selected={tipoEvento === tipo}
                onPress={() => setTipoEvento(tipo)}
              />
            ))}
          </ScrollView>
        </View>

        {/* SUBIR DOCUMENTOS */}
        <View style={styles.sectionBlock}>
          <ThemedText style={styles.sectionLabel}>Subir documentos</ThemedText>
          <TouchableOpacity style={styles.uploadButton} activeOpacity={0.7}>
            <Feather name="upload" size={20} color={COLORS.surfaceNeutral9} />
            <ThemedText style={styles.uploadText}>Adjunta documentos permitidos</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.helperText}>
            Formatos permitidos: PDF, Word, PowerPoint, Excel, imágenes (JPG, PNG, WEBP), video (MP4) y audio (MP3). Máx. 10 MB por archivo, excepto videos MP4 hasta 100 MB.
          </ThemedText>
        </View>

        {/* DESCRIPCIÓN */}
        <View style={styles.sectionDesc}>
          <TextInput
            style={styles.inputDesc}
            placeholder="Añadir descripción"
            placeholderTextColor={COLORS.textMuted}
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
          <View style={styles.divider} />
          <ThemedText style={styles.helperTextMsg}>
            La información que publiques podrá ser verificada por tu profesor de asignatura si es correcta, eliminada si es completamente incorrecta, o editada y verificada si requiere cambios.
          </ThemedText>
        </View>

        {/* CHECKBOX */}
        <View style={styles.checkboxContainer}>
          {/* Para este MVP usamos switch hasta crear un componente Checkbox web-style, o simplemente algo interactivo */}
          <TouchableOpacity 
            style={[styles.checkbox, solicitarVerificacion && styles.checkboxActive]}
            onPress={() => setSolicitarVerificacion(!solicitarVerificacion)}
          >
            {solicitarVerificacion && <Ionicons name="checkmark" size={14} color="#fafaf9" />}
          </TouchableOpacity>
          <ThemedText style={styles.checkboxLabel}>
            Solicitar al docente de la asignatura verificar la información después de agregarla
          </ThemedText>
        </View>

        {/* Spacer to avoid being hidden behind bottom bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* BOTTOM ACTION BAR */}
      <View style={styles.bottomBarContainer}>
        <BlurView 
          style={styles.bottomBar}
          intensity={30}
          tint="dark"
          experimentalBlurMethod={blurMethod as any}
        >
          {/* Cancelar Btn (Left rounded corner inside the bar) */}
          <TouchableOpacity 
            style={[styles.actionBtn, styles.btnCancel]} 
            onPress={() => router.back()}
          >
            <ThemedText style={styles.btnCancelText}>Cancelar</ThemedText>
          </TouchableOpacity>
          
          {/* Divisor Visual si es necesario (el figma no parece tener, solo flex) */}
          <View style={{ flex: 1 }} />

          {/* Agregar Btn */}
          <TouchableOpacity 
            style={[styles.actionBtn, styles.btnAdd]}
            onPress={() => {
              // TODO: Logica de agregar evento
              router.back();
            }}
          >
            <ThemedText style={styles.btnAddText}>Agregar</ThemedText>
          </TouchableOpacity>
        </BlurView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingTop: 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    marginBottom: 20,
  },
  inputTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.surfaceNeutral9,
    paddingVertical: 10,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  divider: {
    height: 1.5,
    backgroundColor: COLORS.surfaceNeutral9,
    width: '100%',
    opacity: 0.2, // Simulando el de Figma
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  inputBoxContent: {
    flex: 1,
  },
  inputBoxLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.surfaceNeutral9,
    opacity: 0.75,
  },
  inputBoxValue: {
    fontSize: 14,
    color: COLORS.surfaceNeutral9,
    fontWeight: '500',
    marginTop: 2,
  },
  sectionBlock: {
    marginTop: 10,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.surfaceNeutral9,
    opacity: 0.75,
    marginBottom: 10,
  },
  pillsScroll: {
    flexDirection: 'row',
    gap: 12,
  },
  pill: {
    backgroundColor: COLORS.surfaceNeutral2,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 360,
    marginRight: 10, // Si gap falla en OS antiguos
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: COLORS.pillSelectedBg,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.surfaceNeutral9,
  },
  pillSelectedText: {
    color: COLORS.pillSelectedText,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceNeutral2,
    borderRadius: 360,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    marginBottom: 10,
  },
  uploadText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.surfaceNeutral9,
    marginLeft: 8,
  },
  helperText: {
    fontSize: 11,
    color: COLORS.surfaceNeutral9,
    opacity: 0.6,
    lineHeight: 15,
  },
  sectionDesc: {
    marginTop: 15,
    marginBottom: 20,
  },
  inputDesc: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.surfaceNeutral9,
    paddingVertical: 10,
  },
  helperTextMsg: {
    fontSize: 11,
    color: COLORS.surfaceNeutral9,
    opacity: 0.6,
    lineHeight: 15,
    marginTop: 10,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: COLORS.surfaceNeutral9,
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceNeutral2,
  },
  checkboxActive: {
    backgroundColor: COLORS.surfaceNeutral9,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.surfaceNeutral9,
    lineHeight: 20,
  },
  bottomBarContainer: {
    position: 'absolute',
    bottom: 20,
    left: '10%',
    width: '80%',
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    // Sombras para ios y android base
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    // Sombra SDK 55
    boxShadow: '0px 10px 15px rgba(0,0,0,0.2)',
  },
  bottomBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancel: {
    // Si queremos que el de cancelar sea ligeramente distinto 
  },
  btnCancelText: {
    color: '#fafaf9',
    fontWeight: '600',
    fontSize: 15,
  },
  btnAdd: {
    backgroundColor: COLORS.surfacePrimary, // Color oscuro fuerte para el boton de agregar (#252f2c)
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
  },
  btnAddText: {
    color: '#fafaf9',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
