// Składa makiety: szkielet.html + baza.css + wariant-X.css -> makiety/propozycja-X.html. Uruchomienie: node makiety/src/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
// MAKIETY_ART=<katalog>: dodatkowo wersje bez szkieletu dokumentu (do publikacji jako artefakt)
const ART = process.env.MAKIETY_ART;
if (ART) mkdirSync(ART, { recursive: true });

const VARIANTS = [
  { id: 'a', name: 'Spokojny panel', title: 'CHPC makieta A', fonts: 'Manrope:wght@500;600;700;800&family=Source+Sans+3:wght@400;500;600;700', darkFirst: false,
    desc: 'ciągłość z obecnym turkusem, białe karty na chłodnym szarym tle, zakładki u góry' },
  { id: 'b', name: 'Instrument', title: 'CHPC makieta B', fonts: 'Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700', darkFirst: true,
    desc: 'ciemny panel techniczny, wyraźne linie, liczby w zwężonym kroju, bursztyn i cyjan, boczne menu na komputerze' },
  { id: 'c', name: 'Dom', title: 'CHPC makieta C', fonts: 'Outfit:wght@500;600;700&family=Nunito:wght@400;600;700', darkFirst: false,
    desc: 'przyjazny i miękki, karty bez linii oddzielone kontrastem i cieniem, kolorowy nagłówek sterownika' },
];

const skeleton = readFileSync(join(HERE, 'szkielet.html'), 'utf8');
const base = readFileSync(join(HERE, 'baza.css'), 'utf8');

function themeCss(raw, darkFirst) {
  const m = raw.match(/\/\*DARK\*\/([\s\S]*?)\/\*\/DARK\*\//);
  const dark = m[1].trim();
  const rest = raw.replace(m[0], '__THEME__');
  const rootMatch = rest.match(/:root \{([\s\S]*?)\n\}/);
  const light = rootMatch[1].trim();
  const before = rest.slice(0, rootMatch.index);
  const after = rest.slice(rootMatch.index + rootMatch[0].length).replace('__THEME__', '');
  let block;
  if (!darkFirst) {
    block = `:root {\n  ${light}\n}\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {\n  ${dark}\n} }\n:root[data-theme="dark"] {\n  ${dark}\n}`;
  } else {
    // ciemny jako domyślny: jasne wartości tylko przy jawnym wyborze albo jasnym motywie systemu
    const lightVals = `color-scheme: light;\n  ${light.replace(/color-scheme:[^;]+;\s*/g, '')}`;
    block = `:root {\n  ${light.replace(/color-scheme:[^;]+;\s*/g, '')}\n  ${dark}\n}\n@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {\n  ${lightVals}\n} }\n:root[data-theme="light"] {\n  ${lightVals}\n}`;
  }
  return before + block + after;
}

for (const v of VARIANTS) {
  const varCss = themeCss(readFileSync(join(HERE, `wariant-${v.id}.css`), 'utf8'), v.darkFirst);
  const body = skeleton.replace('__NAZWA__', `Propozycja ${v.id.toUpperCase()} · ${v.name}`).replace('__WARIANT__', v.id.toUpperCase());
  const fontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${v.fonts}&display=swap">`;
  const style = `<style>\n${varCss}\n${base}\n</style>`;
  const head = `<title>${v.title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fontsLink}\n${style}`;

  const full = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="${v.darkFirst ? 'dark light' : 'light dark'}">
<!-- Makieta nowego wyglądu chpc-web, propozycja ${v.id.toUpperCase()} „${v.name}”: ${v.desc}.
     Plik samodzielny (oprócz czcionek z Google Fonts): otwórz w przeglądarce na telefonie (360 / 412 px) i komputerze.
     Źródło: makiety/src/ (szkielet.html, baza.css, wariant-${v.id}.css), składanie: node makiety/src/build.mjs -->
${head}
</head>
<body>
${body}
</body>
</html>
`;
  writeFileSync(join(REPO, `propozycja-${v.id}.html`), full);
  if (ART) writeFileSync(join(ART, `propozycja-${v.id}.html`), `${head}\n${body}\n`);
  console.log('zapisano', v.id);
}

// Pełna makieta (etap 2) w kierunku B: makieta.html + baza.css + makieta.css + tokeny wariantu B.
{
  const v = VARIANTS.find((x) => x.id === 'b');
  const varCss = themeCss(readFileSync(join(HERE, 'wariant-b.css'), 'utf8'), true);
  const body = readFileSync(join(HERE, 'makieta.html'), 'utf8');
  const extra = readFileSync(join(HERE, 'makieta.css'), 'utf8');
  const fontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${v.fonts}&family=JetBrains+Mono:wght@500&display=swap">`;
  const head = `<title>CHPC makieta</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fontsLink}\n<style>\n${varCss}\n${base}\n${extra}\n</style>`;
  const full = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<!-- Pełna makieta nowego wyglądu chpc-web (etap 2, kierunek B „${v.name}”): lista sterowników, wszystkie zakładki pompy ciepła,
     ekrany główne fotowoltaiki, hydroforu, włącznika i pieca, logowanie, konto, okna. Plik samodzielny (oprócz czcionek z Google Fonts).
     Źródło: makiety/src/ (makieta.html, makieta.css, baza.css, wariant-b.css), składanie: node makiety/src/build.mjs -->
${head}
</head>
<body>
${body}
</body>
</html>
`;
  writeFileSync(join(REPO, 'makieta.html'), full);
  if (ART) writeFileSync(join(ART, 'makieta.html'), `${head}\n${body}\n`);
  console.log('zapisano makieta');
}
