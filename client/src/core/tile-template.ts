// Wzór kafelka sterownika na stronie /devices (prostokąt, obecny układ listy). Edytuje go projektant kafelka
// w aplikacji (/tile-designer, zapis na serwerze: GET/PUT/DELETE /api/devices/tile-template); bez zapisanego
// wzoru obowiązuje TILE_TEMPLATE, który odwzorowuje kafelek sprzed projektanta (zmierzony 2026-10-16).
// w, h: rozmiar kafelka na komputerze [px] (na liście szerokość 300/340–100 % w, wysokość z proporcji); gap: odstęp
// między kafelkami [px]; f: pola, położenie i rozmiar w % kafelka (x, y, w, h), wyrównanie a i widoczność v.
// Czcionka pola = wysokość pola × współczynnik k z TILE_SLOTS (w CSS jednostki cqh kafelka), więc wzór
// pasuje do każdej szerokości.
export type TileSlot =
  'icon' | 'name' | 'status' | 'main' | 'mainLabel' | 'divider' | 'side1' | 'side2' | 'side3' | 'row' | 'relays'
  | 'warning' | 'footer';
export type TileField = {
  x: number; y: number; w: number; h: number; a: 'left' | 'center' | 'right'; v: boolean;
  /** czcionka w cqh ustalona przy zwijaniu pasa (removeBand), żeby została w px ta sama; nie zapisywana we wzorze */
  fs?: number;
};
export type TileTemplate = { w: number; h: number; gap?: number; f: Record<TileSlot, TileField> };

// k = wielkość czcionki jako część wysokości pola (0: ikona i linia bez tekstu); kolejność = kolejność rysowania.
// Pola wielowierszowe (przekaźniki, ostrzeżenie, stopka) mają mniejsze k, bo mieszczą 2 wiersze.
export const TILE_SLOTS: Record<TileSlot, { label: string; k: number }> = {
  icon: { label: 'Ikona rodzaju', k: 0 },
  name: { label: 'Nazwa', k: 0.87 },
  status: { label: 'Stan', k: 0.61 },
  main: { label: 'Wartość główna', k: 0.91 },
  mainLabel: { label: 'Opis wartości', k: 0.835 },
  divider: { label: 'Linia', k: 0 },
  side1: { label: 'Wartość 1', k: 0.83 },
  side2: { label: 'Wartość 2', k: 0.83 },
  side3: { label: 'Wartość 3', k: 0.83 },
  row: { label: 'Wiersz wartości', k: 0.83 },
  relays: { label: 'Przekaźniki (2 wiersze)', k: 0.41 },
  warning: { label: 'Ostrzeżenie (2 wiersze)', k: 0.3 },
  footer: { label: 'Stopka (2 wiersze)', k: 0.225 },
};
export const TILE_SLOT_KEYS = Object.keys(TILE_SLOTS) as TileSlot[];

// obszar ołówka i trybika w prawym dolnym rogu kafelka (pages/Devices): projektant ostrzega, gdy pole na niego wchodzi
export const TILE_TOOLS_AREA = { x: 78, y: 76.7, w: 20, h: 12.1 };

// Wzór domyślny = kafelek z produkcji (zmierzony 2026-10-16 na danych z produkcji przy skali 0,9: 306 px
// szerokości, 156 px bez ostrzeżenia, +49 px z ostrzeżeniem, +21 px przy drugim wierszu stopki), od 2026-10-16
// z ołówkiem i trybikiem na wysokości pierwszego wiersza stopki i mniejszym marginesem na dole (decyzja użytkownika). Wysokość wzoru
// obejmuje ostrzeżenie i dwa wiersze stopki; kafelek bez nich jest niższy (collapseEmpty, collapseFooterLine).
// Pod stopką zostaje margines ok. 3,5 % wysokości.
export const TILE_TEMPLATE: TileTemplate = { w: 340, h: 239, gap: 16, f: {
  icon: { x: 3.3, y: 5.0, w: 9.6, h: 13.4, a: 'center', v: true },
  name: { x: 15.3, y: 7.4, w: 54, h: 8.5, a: 'left', v: true },
  status: { x: 70, y: 7.3, w: 25.8, h: 8.6, a: 'right', v: true },
  main: { x: 3.3, y: 21.8, w: 42, h: 11.7, a: 'left', v: true },
  mainLabel: { x: 12.3, y: 33.5, w: 33, h: 6.4, a: 'left', v: true },
  divider: { x: 45.4, y: 21.8, w: 0.5, h: 17.8, a: 'left', v: false },
  side1: { x: 45.5, y: 21.8, w: 51.2, h: 9.2, a: 'right', v: true },
  side2: { x: 45.5, y: 31.8, w: 51.2, h: 9.2, a: 'right', v: true },
  side3: { x: 45.5, y: 43.2, w: 51.2, h: 9.2, a: 'right', v: false },
  row: { x: 3.3, y: 43.6, w: 93.4, h: 9.2, a: 'left', v: true },
  relays: { x: 3.3, y: 21.8, w: 92.5, h: 18.5, a: 'left', v: true },
  warning: { x: 3.3, y: 56.4, w: 92.5, h: 19.0, a: 'left', v: true },
  footer: { x: 3.3, y: 78.2, w: 70, h: 18.0, a: 'left', v: true },
} };

// Usuwa poziomy pas [from, from + size) kafelka (w % wysokości): pola pod nim podjeżdżają, pole przecinające pas
// się skraca, kafelek jest niższy o pas. Położenia i wysokości są przeliczane na nową wysokość, a czcionka każdego
// pola (fs, cqh) tak, żeby w px została ta sama.
function removeBand(template: TileTemplate, from: number, size: number): TileTemplate {
  if (size <= 0 || size >= 95) return template;
  const to = from + size;
  const scale = 100 / (100 - size);
  const f = { ...template.f };
  TILE_SLOT_KEYS.forEach((key) => {
    const field = template.f[key];
    const fs = (field.fs ?? field.h * TILE_SLOTS[key].k) * scale;
    let { y, h } = field;
    if (y >= to - 0.01) y -= size;
    else if (y + h > from + 0.01) h = Math.max(0, Math.min(y + h, from) - y) + Math.max(0, y + h - to);
    f[key] = { ...field, y: y * scale, h: h * scale, fs };
  });
  return { ...template, h: template.h * (100 - size) / 100, f };
}

// Pola bez treści (np. ostrzeżenie, wiersz wartości przy fotowoltaice offline) nie zostawiają pustego miejsca, jak na
// produkcji: pas od górnej krawędzi pustego pola do najbliższego pola z treścią poniżej znika, a pola pod nim
// podjeżdżają. Pas zostaje, gdy przecina go pole z treścią (np. puste Przekaźniki obok wartości głównej).
export function collapseEmpty(template: TileTemplate, present: Set<TileSlot>): TileTemplate {
  let current = template;
  const hasContent = (key: TileSlot) => current.f[key].v && (key === 'divider' || present.has(key));
  const skipped = new Set<TileSlot>();
  for (;;) {
    const empty = TILE_SLOT_KEYS.filter((key) => current.f[key].v && !hasContent(key) && !skipped.has(key));
    const key = empty.sort((a, b) => current.f[a].y - current.f[b].y)[0];
    if (!key) return current;
    const field = current.f[key];
    const bottom = field.y + field.h;
    const below = TILE_SLOT_KEYS.filter((other) => hasContent(other) && current.f[other].y >= bottom - 0.01);
    const to = below.length ? Math.min(...below.map((other) => current.f[other].y)) : bottom;
    const crossing = TILE_SLOT_KEYS.some((other) => hasContent(other)
      && current.f[other].y < to - 0.01 && current.f[other].y + current.f[other].h > field.y + 0.01);
    if (crossing || to - field.y <= 0) { skipped.add(key); continue; }
    current = removeBand(current, field.y, Math.min(to - field.y, 90));
    current = { ...current, f: { ...current.f, [key]: { ...current.f[key], v: false } } };
  }
}

// Stopka z jednym wierszem: dolna połowa pola Stopka znika, kafelek jest niższy o jeden wiersz.
export function collapseFooterLine(template: TileTemplate): TileTemplate {
  const footer = template.f.footer;
  if (!footer.v) return template;
  return removeBand(template, footer.y + footer.h / 2, footer.h / 2);
}

// Kafelek bez wartości bocznych (np. hydrofor): wartość główna sięga do prawej krawędzi kolumny wartości, jak na
// produkcji, gdzie prawa kolumna bez treści nie zajmuje miejsca.
export function widenMain(template: TileTemplate): TileTemplate {
  const sides = (['side1', 'side2', 'side3'] as const).map((key) => template.f[key]).filter((field) => field.v);
  const main = template.f.main;
  if (!sides.length || !main.v) return template;
  const right = Math.max(...sides.map((field) => field.x + field.w));
  if (right <= main.x + main.w) return template;
  return { ...template, f: { ...template.f, main: { ...main, w: right - main.x } } };
}

// Jedna wartość boczna (np. CWU przy piecu): stoi na środku wysokości bloku wartości głównej z podpisem, jak na
// produkcji, gdzie prawa kolumna jest wyśrodkowana względem lewej.
export function centerSingleSide(template: TileTemplate): TileTemplate {
  const { main, mainLabel, side1 } = template.f;
  if (!main.v || !side1.v) return template;
  const bottom = mainLabel.v ? Math.max(main.y + main.h, mainLabel.y + mainLabel.h) : main.y + main.h;
  const y = (main.y + bottom) / 2 - side1.h / 2;
  return { ...template, f: { ...template.f, side1: { ...side1, y } } };
}

export const cloneTemplate = (template: TileTemplate): TileTemplate => JSON.parse(JSON.stringify(template));

// Wzór wklejony („Wklej wzór”) albo z serwera: brakujące pola z wbudowanego (ukryte), null przy złym.
export function normalizeTemplate(input: unknown): TileTemplate | null {
  const t = input as TileTemplate | null;
  if (!t || typeof t !== 'object' || !t.f || !(t.w > 0) || !(t.h > 0)) return null;
  const f = { ...t.f };
  TILE_SLOT_KEYS.forEach((key) => { if (!f[key]) f[key] = { ...TILE_TEMPLATE.f[key], v: false }; });
  return { w: t.w, h: t.h, gap: t.gap ?? 0, f };
}

// Ostatni wzór z serwera w localStorage: lista od razu rysuje się właściwym wzorem, bez przeskoku po wczytaniu.
const TEMPLATE_CACHE_KEY = 'chpc.tileTemplate';
export function cachedTemplate(): TileTemplate {
  try {
    return normalizeTemplate(JSON.parse(localStorage.getItem(TEMPLATE_CACHE_KEY) ?? 'null')) ?? TILE_TEMPLATE;
  } catch {
    return TILE_TEMPLATE;
  }
}
export function cacheTemplate(template: TileTemplate | null) {
  try {
    if (template) localStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify(template));
    else localStorage.removeItem(TEMPLATE_CACHE_KEY);
  } catch { /* bez pamięci podręcznej */ }
}
