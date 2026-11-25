// GET /api/lecturas — datos de Goodreads para la pestaña Lecturas de Consulta.
//   ?vista=biblioteca            leyendo, quiero leer, leídos, perfil y desafíos (con ?nuevo=1 no usa la copia)
//   ?vista=buscar&q=texto         búsqueda en Goodreads
//   ?vista=libro&id=123           ficha de un libro
// Goodreads no tiene API: se leen sus páginas públicas (lib/goodreads.js). Lo leído se guarda unos minutos en la
// memoria de la función para no pedirle lo mismo a Goodreads a cada rato.
import { preparar, responder, manejar, error } from '../lib/http.js';
import { autorizar } from '../lib/llaves.js';
import * as G from '../lib/goodreads.js';

const copias = new Map();
async function guardado(clave, ms, fn) {
  const c = copias.get(clave);
  if (ms && c && Date.now() - c.t < ms) return c.v;
  const v = await fn();
  copias.set(clave, { t: Date.now(), v });
  if (copias.size > 200) copias.delete(copias.keys().next().value);
  return v;
}
export function olvidar() { copias.clear(); }

// Igual que api/library.js de Lecturas
export async function biblioteca() {
  const errors = [];
  const safe = async (label, fn, fallback) => { try { return await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); return fallback; } };
  const [reading, toRead, read, profile, challenges] = await Promise.all([
    safe('leyendo', () => G.fetchWidgetShelf('currently-reading', { max: 50 }), []),
    safe('quiero leer', () => G.fetchWidgetShelf('to-read', { max: 200 }), []),
    safe('leídos', () => G.fetchWidgetShelf('read', { sort: 'date_read', max: 200 }), []),
    safe('perfil', async () => G.parseProfile((await G.get(`https://www.goodreads.com/user/show/${G.USER_ID}`)).text), null),
    safe('desafíos', () => G.fetchChallenges(), []),
  ]);
  // Avance de lectura (está en el perfil, no en el widget)
  const progress = (profile && profile.progress) || {};
  for (const b of reading) if (progress[b.id]) b.progress = progress[b.id];
  // Cruce entre los libros de cada desafío y los leídos del widget: el widget aporta la nota y el título completo;
  // el desafío aporta el año.
  const readById = new Map(read.map((b) => [b.id, b]));
  for (const c of challenges) {
    c.books = (c.books || []).map((b) => {
      const w = readById.get(b.id);
      if (w && !w.year) w.year = c.year;
      return w ? { ...b, title: w.title, series: w.series || b.series, author: w.author || b.author, cover: w.cover || b.cover, userRating: w.userRating } : { ...b, userRating: null };
    });
  }
  if (!reading.length && !toRead.length && !read.length && !challenges.length) {
    const e = error(502, 'No fue posible leer los datos de Goodreads.');
    e.sinCopia = true;
    throw e;
  }
  const shelves = (profile && profile.shelves) || {};
  return {
    user: { id: G.USER_ID, name: (profile && profile.name) || 'Lector', avatar: (profile && profile.avatar) || null, url: `https://www.goodreads.com/user/show/${G.USER_ID}` },
    updatedAt: new Date().toISOString(),
    errors,
    counts: { reading: shelves['currently-reading'] ?? reading.length, toRead: shelves['to-read'] ?? toRead.length, read: shelves.read ?? read.length },
    challenges, reading, toRead, read,
  };
}

export default async function handler(req, res) {
  if (!preparar(req, res, ['GET'])) return;
  await manejar(res, async () => {
    await autorizar(req, 'lecturas');
    const vista = String(req.query.vista || 'biblioteca');
    if (vista === 'biblioteca') return responder(res, 200, await guardado('biblioteca', req.query.nuevo ? 0 : 10 * 60000, biblioteca));
    if (vista === 'buscar') {
      const q = String(req.query.q || '').trim().slice(0, 120);
      if (q.length < 2) return responder(res, 200, { results: [] });
      try { return responder(res, 200, { results: await guardado('q:' + q.toLowerCase(), 3600000, () => G.searchBooks(q)) }); }
      catch (e) { throw error(502, 'La búsqueda no está disponible en este momento.'); }
    }
    if (vista === 'libro') {
      const id = (String(req.query.id || '').match(/^\d+/) || [])[0];
      if (!id) throw error(400, 'Falta el identificador del libro.');
      try { return responder(res, 200, await guardado('libro:' + id, 86400000, async () => G.parseBookPage((await G.get(`https://www.goodreads.com/book/show/${id}`)).text, id))); }
      catch (e) { throw error(502, 'No se pudo cargar la ficha del libro.'); }
    }
    throw error(400, 'Vista desconocida: usa biblioteca, buscar o libro.');
  });
}
