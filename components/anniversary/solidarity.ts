import type { AnniversaryActivity } from '@/services/anniversary-service';

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
    'Fideos: 6 paquetes de 400 g',
    'Salsa de tomate: 6 sachets de 200 g',
    'Arroz: 4 paquetes de 1 kg',
    'Aceite: 2 botellas de 900 ml',
    'Harina: 4 paquetes de 1 kg',
    'Azúcar: 4 paquetes de 1 kg',
    'Sal: 4 paquetes de 1 kg',
    'Jurel: 4 latas de 425 g',
    'Legumbres: 4 paquetes de 1 kg',
    'Té: 2 cajas de 20 unidades',
    'Café: 2 tarros de 170 g',
  ],
  bonus: [
    { key: 'diapers', label: 'Pañales (bolsa de 24)', points: 500 },
    { key: 'pads', label: 'Toallas higiénicas (paquete de 8)', points: 100 },
    { key: 'wipes', label: 'Toallas húmedas', points: 100 },
    { key: 'toiletPaper', label: 'Papel higiénico (4 rollos)', points: 200 },
    { key: 'pellet', label: 'Pellet (bolsa de 15 kg)', points: 500 },
    { key: 'dogFood', label: 'Comida de perro (1 kg)', points: 300 },
    { key: 'dogWet', label: 'Comida húmeda de perro (100 g)', points: 100 },
    { key: 'catFood', label: 'Comida de gato (1 kg)', points: 300 },
    { key: 'catWet', label: 'Comida húmeda de gato (100 g)', points: 100 },
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
