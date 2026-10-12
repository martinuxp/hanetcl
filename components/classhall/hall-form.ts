import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { StyleSheet } from 'react-native';

/** Shared look of the Hall's sheets (announcement, evaluation), as in "Crear un Hall". */
export const hallFormStyles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: AppSpacing.xl,
    gap: AppSpacing.xl,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -1.08,
    color: AppColors.textPrimary,
  },
  lead: {
    marginTop: -AppSpacing.md,
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.3,
    color: AppColors.textSecondary,
  },
  field: {
    gap: AppSpacing.sm,
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  },
  optional: {
    fontFamily: 'DMSans_500Medium',
    color: AppColors.textSecondary,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadii.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.canvas,
    fontFamily: 'DMSans_500Medium',
    fontSize: 16,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
    outlineStyle: 'none' as never,
  },
  multiline: {
    minHeight: 160,
    paddingTop: AppSpacing.lg,
    paddingBottom: AppSpacing.lg,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  hint: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.textSecondary,
  },
  error: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.errorText,
  },
  submit: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.primary,
  },
  submitDisabled: {
    backgroundColor: AppColors.surfaceMuted,
    opacity: 0.65,
  },
  submitText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  },
  cancel: {
    minHeight: AppTouch.minimum,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  cancelText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
});
