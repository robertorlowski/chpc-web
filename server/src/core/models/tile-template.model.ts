// Wzór kafelka na liście sterowników (/devices): jeden dokument (key „default”) z rozmiarem komórki, odstępem
// i położeniem pól. Zapisuje go projektant kafelka w aplikacji; bez dokumentu klient używa wzoru wbudowanego.
// Zasady i walidacja: core/services/tile-template.service.ts.
import { Schema, model } from 'mongoose';
import { TileTemplate } from '../types';

export interface TileTemplateDocument {
  key: string;
  template: TileTemplate;
}

const TileTemplateSchema = new Schema<TileTemplateDocument>(
  {
    key: { type: String, required: true, unique: true },
    template: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: 'tile_template' }
);

export const TileTemplateModel = model<TileTemplateDocument>('TileTemplate', TileTemplateSchema);
