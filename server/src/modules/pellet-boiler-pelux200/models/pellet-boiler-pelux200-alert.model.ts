// Dziennik alarmów kotła (kolekcja pellet_boiler_pelux200_alerts, od firmware pieca 1.7.0): wpisy z panelu kotła
// przesyłane przez sterownik (POST /pellet-boiler-pelux200/alerts). Jeden dokument na alarm: rootId + kod + początek
// (fromRaw, sekundy ecoMAX); koniec uzupełnia się przy kolejnych przesłaniach. Panel trzyma 100 ostatnich wpisów,
// baza zatrzymuje też starsze. initial = wpis z pierwszego przesłania (historia sprzed wdrożenia: lista tak, pasek
// na stronie głównej nie). Brak retencji (najwyżej kilkaset wpisów rocznie).
import { Schema, model } from 'mongoose';

export interface PelletBoilerAlertEntry {
  rootId: string;
  code: number;
  fromRaw: number;
  toRaw: number | null;
  from: Date;
  to: Date | null;
  // data z zegara regulatora sprzed ustawienia (rok < 2020, np. 2018 po zaniku zasilania)
  uncertain: boolean;
  initial: boolean;
  seenAt: Date;
  createdAt?: Date;
}

const PelletBoilerAlertSchema = new Schema<PelletBoilerAlertEntry>(
  {
    rootId: { type: String, required: true },
    code: { type: Number, required: true },
    fromRaw: { type: Number, required: true },
    toRaw: { type: Number, default: null },
    from: { type: Date, required: true },
    to: { type: Date, default: null },
    uncertain: { type: Boolean, default: false },
    initial: { type: Boolean, default: false },
    seenAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'pellet_boiler_pelux200_alerts' },
);
PelletBoilerAlertSchema.index({ rootId: 1, code: 1, fromRaw: 1 }, { unique: true });
PelletBoilerAlertSchema.index({ rootId: 1, from: -1 });

export const PelletBoilerAlertModel = model<PelletBoilerAlertEntry>('PelletBoilerAlert', PelletBoilerAlertSchema);
