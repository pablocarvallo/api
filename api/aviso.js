// POST /api/aviso — Atajos entrega un correo de aviso. Queda como archivo en avisos/AAAA-MM/ de pablocarvallo/datos
// y la tarea «Leer avisos» lo convierte en movimientos. Cuerpo: { "fuente": "bancochile" | "copec", "asunto": "…", "texto": "…" }
//
// El archivo se llama con la huella del correo (asunto y texto). Las automatizaciones del banco y de Copec se activan
// con el mismo correo, así que cada correo llega dos veces: la segunda se reconoce y no se guarda (responde 200 con
// «repetido»). No se usan issues para que GitHub no mande un correo por cada aviso.
import { createHash } from 'node:crypto';
import { preparar, responder, cuerpo, manejar, error } from '../lib/http.js';
import { autorizar } from '../lib/llaves.js';
import { crearArchivo } from '../lib/github.js';

const MAX = 60000;

export function huellaAviso(asunto, texto) {
  const normal = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normal(asunto) + '\n' + normal(texto)).digest('hex').slice(0, 16);
}

// «AAAA-MM» del momento dado, en hora de Chile
export function mesChile(fecha = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).formatToParts(fecha);
  return p.find((x) => x.type === 'year').value + '-' + p.find((x) => x.type === 'month').value;
}

export default async function handler(req, res) {
  if (!preparar(req, res, ['POST'])) return;
  await manejar(res, async () => {
    const quien = await autorizar(req, 'aviso');
    const b = cuerpo(req);
    const texto = String(b.texto || b.cuerpo || '');
    if (!texto.trim()) throw error(400, 'Falta el texto del aviso');
    const f = String(b.fuente || '').toLowerCase();
    const fuente = f === 'bancochile' || f === 'copec' ? f : '';
    const asunto = String(b.asunto || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const ahora = new Date();
    const id = mesChile(ahora) + '/' + huellaAviso(asunto, texto);
    const r = await crearArchivo('avisos/' + id + '.json',
      { recibido: ahora.toISOString(), fuente, asunto, texto: texto.slice(0, MAX), enviado_por: quien.nombre },
      'Aviso recibido' + (fuente ? ' (' + fuente + ')' : ''));
    responder(res, r.existia ? 200 : 201, { ok: true, aviso: id, ...(r.existia ? { repetido: true } : {}) });
  });
}
