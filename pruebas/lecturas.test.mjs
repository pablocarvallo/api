// Pruebas de /api/lecturas con GitHub y Goodreads falsos (páginas inventadas, recortadas a lo que se lee).
// Correr con: node --test pruebas/*.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.GITHUB_TOKEN = 'token-de-prueba';
const h = (t) => createHash('sha256').update(t).digest('hex');
const dispositivos = { llaves: [
  { id: 'a1', nombre: 'iPhone', tipo: 'dispositivo', hash: h('llave-iphone') },
  { id: 'c3', nombre: 'Widget', tipo: 'widget', hash: h('llave-widget') },
], pendientes: [] };

const PORTADA = 'https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1266724005l/1124818._SX98_.jpg';
const libro = (id, titulo, autor, nota) => `<div class="gr_custom_each_container_lecturas">` +
  `<a title="${titulo}" href="https://www.goodreads.com/review/show/9${id}"><img src="${PORTADA.replace('1124818', id)}"></a>` +
  `<div class="gr_custom_title_lecturas"><a href="#">${titulo}</a></div><div class="gr_custom_author_lecturas">by <a href="#">${autor}</a></div>` +
  (nota ? `<div class="gr_custom_rating_lecturas"><span class="staticStars notranslate" title="${nota}"></span></div>` : '') + '</div>';
const PAGINAS = {
  'currently-reading': libro('1124818', 'El nombre del viento (Crónica del asesino de reyes, #1)', 'Patrick Rothfuss'),
  'to-read': libro('2000001', 'Pedro Páramo', 'Juan Rulfo') + libro('2000002', 'Rayuela', 'Julio Cortázar'),
  read: libro('3000001', 'Ficciones', 'Jorge Luis Borges', 'it was amazing'),
};
const PERFIL = '<meta property="profile:first_name" content="Pablo"><meta property="og:image" content="https://img/avatar.jpg">' +
  '<a href="/review/list/90308354?shelf=read">read&lrm; (169)</a>' +
  ' is currently reading <a href="/book/show/1124818-el-nombre">El nombre del viento</a> (page 120 of 400)';
const WIDGET = 'challenges\\/11680-2026-reading-challenge gr_challenge_progress_body_1 >12 of 30 (40%)< user_challenges\\/777 user\\/show\\/90308354-pablo';
const DESAFIO = '<p>Pablo has read 13 of 30 books in 2026.</p><a href="/book/show/3000001"><img alt="Ficciones by Jorge Luis Borges" src="https://img/books/1l/3000001._SX98_.jpg"></a>';

let pedidos;
const json = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo });
const pagina = (status, texto, url) => ({ ok: status < 400, status, url, text: async () => texto });
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.startsWith('https://api.github.com/')) return json(200, { sha: 's1', content: Buffer.from(JSON.stringify(dispositivos)).toString('base64') });
  pedidos.push(url);
  const u = new URL(url);
  if (u.pathname.startsWith('/review/custom_widget/')) return pagina(200, PAGINAS[u.searchParams.get('shelf')] || '', url);
  if (u.pathname === '/user/show/90308354') return pagina(200, PERFIL, url);
  if (u.pathname.startsWith('/user_challenges/widget/')) return pagina(u.searchParams.get('challenge_id') && u.searchParams.get('challenge_id') !== '11680' ? 404 : 200, WIDGET, url);
  if (u.pathname === '/user_challenges/777') return pagina(200, DESAFIO, url);
  if (u.pathname === '/book/auto_complete') return pagina(200, JSON.stringify([{ bookId: 4000001, bookTitleBare: 'Cien años de soledad', author: { name: 'Gabriel García Márquez' }, imageUrl: '', numPages: 471, avgRating: '4.12' }]), url);
  if (u.pathname === '/book/show/4000001') return pagina(200, '<script type="application/ld+json">{"name":"Cien años de soledad","author":[{"name":"Gabriel García Márquez"}],"numberOfPages":471,"aggregateRating":{"ratingValue":4.12,"ratingCount":900000}}</script><meta property="og:description" content="Macondo.">First published 1967', url);
  return pagina(404, '', url);
};

const { default: lecturas, olvidar } = await import('../api/lecturas.js');
function llamar({ llave, query = {} } = {}) {
  return new Promise((resolve) => {
    const req = { method: 'GET', query, headers: Object.assign({ origin: 'https://pablocarvallo.github.io' }, llave ? { authorization: 'Bearer ' + llave } : {}) };
    const res = { _h: {}, statusCode: 200,
      setHeader(k, v) { this._h[k] = v; }, status(c) { this.statusCode = c; return this; },
      json(c) { resolve({ status: this.statusCode, cuerpo: c, h: this._h }); }, end() { resolve({ status: this.statusCode, h: this._h }); } };
    lecturas(req, res);
  });
}
beforeEach(() => { pedidos = []; olvidar(); });

test('Lecturas pide la llave de un dispositivo', async () => {
  assert.equal((await llamar({})).status, 401);
  assert.equal((await llamar({ llave: 'llave-widget' })).status, 403);
});

test('Biblioteca: estantes, avance, desafío del año y nota de los leídos', async () => {
  const r = await llamar({ llave: 'llave-iphone' });
  assert.equal(r.status, 200);
  assert.equal(r.h['Access-Control-Allow-Origin'], 'https://pablocarvallo.github.io');
  const d = r.cuerpo;
  assert.equal(d.user.name, 'Pablo');
  assert.equal(d.reading[0].title, 'El nombre del viento');
  assert.equal(d.reading[0].series, 'Crónica del asesino de reyes, #1');
  assert.deepEqual(d.reading[0].progress, { percent: 30, page: 120, of: 400 });
  assert.equal(d.toRead.length, 2);
  assert.equal(d.counts.read, 169);
  const c = d.challenges.find((x) => x.year === 2026);
  assert.deepEqual([c.read, c.goal, c.books.length, c.books[0].userRating], [13, 30, 1, 5]);
});

test('Biblioteca: la segunda vez usa la copia, salvo que se pida de nuevo', async () => {
  await llamar({ llave: 'llave-iphone' });
  const n = pedidos.length;
  await llamar({ llave: 'llave-iphone' });
  assert.equal(pedidos.length, n);
  await llamar({ llave: 'llave-iphone', query: { nuevo: '1' } });
  assert.ok(pedidos.length > n);
});

test('Búsqueda y ficha de un libro', async () => {
  assert.deepEqual((await llamar({ llave: 'llave-iphone', query: { vista: 'buscar', q: 'c' } })).cuerpo, { results: [] });
  const b = await llamar({ llave: 'llave-iphone', query: { vista: 'buscar', q: 'cien años' } });
  assert.equal(b.cuerpo.results[0].title, 'Cien años de soledad');
  assert.equal(b.cuerpo.results[0].pages, 471);
  const f = await llamar({ llave: 'llave-iphone', query: { vista: 'libro', id: '4000001' } });
  assert.deepEqual([f.cuerpo.author, f.cuerpo.pages, f.cuerpo.published, f.cuerpo.description], ['Gabriel García Márquez', 471, '1967', 'Macondo.']);
  assert.equal((await llamar({ llave: 'llave-iphone', query: { vista: 'libro', id: 'x' } })).status, 400);
  assert.equal((await llamar({ llave: 'llave-iphone', query: { vista: 'otra' } })).status, 400);
});
