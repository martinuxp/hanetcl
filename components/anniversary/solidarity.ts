import type { AnniversaryActivity } from '@/services/anniversary-service';
import { t } from '@/i18n';

// The "Alianza solidaria" of the pilot's bases: a minimum of baskets gives a
// fixed amount, every basket after it adds a little less as they pile up, and
// each bonus item has its own points. The calculator turns what the CEE
// counted into points; the count is saved with the result as its `tally`.

export const SOLIDARITY = {
  minimum: 10,
  minimumPoints: 10000,
  /** Baskets 11 to 30 give 500 each; from 31 on, 200 each. */
  tiers: [
    { upTo: 30, each: 500 },
    { upTo: Infinity, each: 200 },
  ],
  basket: [
    t('components.anniversary.solidarity.fideos6PaquetesDe400'),
    t('components.anniversary.solidarity.salsaDeTomate6Sachets'),
    t('components.anniversary.solidarity.arroz4PaquetesDe1'),
    t('components.anniversary.solidarity.aceite2BotellasDe900'),
    t('components.anniversary.solidarity.harina4PaquetesDe1'),
    t('components.anniversary.solidarity.azucar4PaquetesDe1'),
    t('components.anniversary.solidarity.sal4PaquetesDe1'),
    t('components.anniversary.solidarity.jurel4LatasDe425'),
    t('components.anniversary.solidarity.legumbres4PaquetesDe1'),
    t('components.anniversary.solidarity.te2CajasDe20'),
    t('components.anniversary.solidarity.cafe2TarrosDe170'),
  ],
  bonus: [
    { key: 'diapers', label: t('components.anniversary.solidarity.panalesBolsaDe24'), points: 500 },
    { key: 'pads', label: t('components.anniversary.solidarity.toallasHigienicasPaqueteDe8'), points: 100 },
    { key: 'wipes', label: t('components.anniversary.solidarity.toallasHumedas'), points: 100 },
    { key: 'toiletPaper', label: t('components.anniversary.solidarity.papelHigienico4Rollos'), points: 200 },
    { key: 'pellet', label: t('components.anniversary.solidarity.pelletBolsaDe15Kg'), points: 500 },
    { key: 'dogFood', label: t('components.anniversary.solidarity.comidaDePerro1Kg'), points: 300 },
    { key: 'dogWet', label: t('components.anniversary.solidarity.comidaHumedaDePerro100'), points: 100 },
    { key: 'catFood', label: t('components.anniversary.solidarity.comidaDeGato1Kg'), points: 300 },
    { key: 'catWet', label: t('components.anniversary.solidarity.comidaHumedaDeGato100'), points: 100 },
  ],
};

export type SolidarityCount = Record<string, number>;

/** The activity the calculator is for, by its name (the preset is "Alianza solidaria"). */
export function isSolidarity(activity: Pick<AnniversaryActivity, 'name' | 'mode'>) {
  return activity.mode === 'manual' && /solidari/i.test(activity.name);
}

/** What the baskets alone give: nothing under the minimum. */
export function basketPoints(baskets: number) {
  if (baskets < SOLIDARITY.minimum) return 0;
  let points = SOLIDARITY.minimumPoints;
  let counted = SOLIDARITY.minimum;
  for (const tier of SOLIDARITY.tiers) {
    const inTier = Math.max(0, Math.min(baskets, tier.upTo) - counted);
    points += inTier * tier.each;
    counted += inTier;
  }
  return points;
}

export function bonusPoints(count: SolidarityCount) {
  return SOLIDARITY.bonus.reduce((sum, item) => sum + (count[item.key] ?? 0) * item.points, 0);
}

export function solidarityPoints(count: SolidarityCount) {
  return basketPoints(count.baskets ?? 0) + bonusPoints(count);
}
