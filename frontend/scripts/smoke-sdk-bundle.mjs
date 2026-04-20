// Smoke test do bundle ESM do SDK. Importa o artefato compilado em dist/sdk/ e
// confirma que cada export publico esta acessivel sem precisar recompilar.
// Rodar com: node scripts/smoke-sdk-bundle.mjs

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolve(here, '../dist/sdk/index.js');

const conteudo = await readFile(bundle, 'utf8');
const esperados = [
  'iniciarAnalytics',
  'enviarEvento',
  'HeatmapUtils',
  'HeatmapDados',
  'FilaAnalytics',
  'StorageMemoria',
  'criarStorageFila',
];

const faltando = esperados.filter((nome) => !conteudo.includes(nome));
if (faltando.length) {
  console.error('FALTANDO no bundle:', faltando.join(', '));
  process.exit(1);
}

const mod = await import(bundle);
for (const nome of ['iniciarAnalytics', 'enviarEvento', 'HeatmapUtils', 'FilaAnalytics', 'StorageMemoria', 'criarStorageFila']) {
  if (!(nome in mod)) {
    console.error(`export '${nome}' ausente no modulo ESM`);
    process.exit(1);
  }
}

// Uso real minimo: cria uma fila em memoria e enfileira/ confirma.
const fila = new mod.FilaAnalytics(new mod.StorageMemoria(), 10);
const item = await fila.enfileirar({ id_registro: 'smoke', timestamp_inicial: 1, timestamp_final: 2, paginas: {} });
const tamanho1 = await fila.tamanho();
if (tamanho1 !== 1) { console.error(`tamanho apos enfileirar: esperado 1, foi ${tamanho1}`); process.exit(1); }
await fila.confirmar([item.id]);
const tamanho2 = await fila.tamanho();
if (tamanho2 !== 0) { console.error(`tamanho apos confirmar: esperado 0, foi ${tamanho2}`); process.exit(1); }

console.log('OK — bundle ESM exporta e executa corretamente');
