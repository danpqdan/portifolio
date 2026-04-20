import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilaAnalytics, StorageMemoria } from '../sdk/filaAnalytics.ts';
import type { StorageFila } from '../sdk/filaAnalytics.ts';
import type { HeatmapDados } from '../sdk';

const criarPayload = (id: string): HeatmapDados => ({
  id_registro: id,
  timestamp_inicial: 1000,
  timestamp_final: 2000,
  paginas: {},
});

let storage: StorageFila;

beforeEach(() => {
  storage = new StorageMemoria();
});

afterEach(async () => {
  await storage.limpar();
});

describe('FilaAnalytics', () => {
  it('enfileira e conta itens', async () => {
    const fila = new FilaAnalytics(storage, 100);
    await fila.enfileirar(criarPayload('a'));
    await fila.enfileirar(criarPayload('b'));
    expect(await fila.tamanho()).toBe(2);
  });

  it('proximoLote retorna em ordem FIFO sem remover', async () => {
    const fila = new FilaAnalytics(storage, 100);
    await fila.enfileirar(criarPayload('a'));
    await fila.enfileirar(criarPayload('b'));
    await fila.enfileirar(criarPayload('c'));

    const lote = await fila.proximoLote(2);
    expect(lote.map((i) => i.payload.id_registro)).toEqual(['a', 'b']);
    expect(await fila.tamanho()).toBe(3);
  });

  it('confirmar remove itens por id', async () => {
    const fila = new FilaAnalytics(storage, 100);
    const item = await fila.enfileirar(criarPayload('a'));
    await fila.enfileirar(criarPayload('b'));

    await fila.confirmar([item.id]);
    expect(await fila.tamanho()).toBe(1);
    const restante = await fila.proximoLote(10);
    expect(restante[0].payload.id_registro).toBe('b');
  });

  it('respeita limite descartando os mais antigos (FIFO)', async () => {
    const fila = new FilaAnalytics(storage, 3);
    await fila.enfileirar(criarPayload('a'));
    await fila.enfileirar(criarPayload('b'));
    await fila.enfileirar(criarPayload('c'));
    await fila.enfileirar(criarPayload('d'));
    await fila.enfileirar(criarPayload('e'));

    expect(await fila.tamanho()).toBe(3);
    const ordem = (await fila.proximoLote(10)).map((i) => i.payload.id_registro);
    expect(ordem).toEqual(['c', 'd', 'e']);
  });

  it('limpar esvazia a fila', async () => {
    const fila = new FilaAnalytics(storage, 100);
    await fila.enfileirar(criarPayload('a'));
    await fila.limpar();
    expect(await fila.tamanho()).toBe(0);
  });

  it('sobrevive a reload — nova instancia da fila sobre o mesmo storage ve os itens', async () => {
    const fila1 = new FilaAnalytics(storage, 100);
    await fila1.enfileirar(criarPayload('sobrevivente-1'));
    await fila1.enfileirar(criarPayload('sobrevivente-2'));

    // simula reload: nova FilaAnalytics apontando pro mesmo storage
    const fila2 = new FilaAnalytics(storage, 100);
    expect(await fila2.tamanho()).toBe(2);
    const ordem = (await fila2.proximoLote(10)).map((i) => i.payload.id_registro);
    expect(ordem).toEqual(['sobrevivente-1', 'sobrevivente-2']);
  });

  it('cada item ganha id unico e timestamp', async () => {
    const fila = new FilaAnalytics(storage, 100);
    const a = await fila.enfileirar(criarPayload('a'));
    const b = await fila.enfileirar(criarPayload('b'));
    expect(a.id).not.toBe(b.id);
    expect(a.timestamp).toBeLessThanOrEqual(b.timestamp);
  });
});
