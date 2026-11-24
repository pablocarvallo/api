// Pruebas de la función con un GitHub falso en memoria. Correr con: node --test pruebas/*.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.GITHUB_TOKEN = 'token-de-prueba';
const h = (t) => createHash('sha256').update(t).digest('hex');

// ---------- GitHub falso ----------
let archivos, issues, version;
function reiniciar() {
  version = 1;
  issues = [];
  archivos = {
    'dispositivos.json': { llaves: [
      { id: 'a1', nombre: 'iPhone', tipo: 'dispositivo', hash: h('llave-iphone') },
      { id: 'b2', nombre: 'Atajos', tipo: 'atajos', hash: h('llave-atajos') },
      { id: 'c3', nombre: 'Widget', tipo: 'widget', hash: h('llave-widget') },
    ], pendientes: [{ hash: h('ABCD2345'), nombre: 'iPad', tipo: 'dispositivo', vence: new Date(Date.now() + 600000).toISOString() }] },
    'resumen.json': { cuentas: {} },
    'cuentas.json': { cuentas: [] },
  };
  archivos.__sha = {};
  for (const k of Object.keys(archivos)) if (k !== '__sha') archivos.__sha[k] = 'sha' + version;
}
const json = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo });
globalThis.fetch = async (url, op = {}) => {
  const ruta = decodeURI(url.replace('https://api.github.com/repos/pablocarvallo/datos', ''));
  if (ruta === '/issues' && op.method === 'POST') { const b = JSON.parse(op.body); issues.push(b); return json(201, { number: issues.length }); }
  const m = /^\/contents\/(.+)$/.exec(ruta);
  if (m && (!op.method || op.method === 'GET')) {
    if (!(m[1] in archivos)) return json(404, { message: 'Not Found' });
    return json(200, { sha: archivos.__sha[m[1]], content: Buffer.from(JSON.stringify(archivos[m[1]])).toString('base64') });
  }
  if (m && op.method === 'PUT') {
    const b = JSON.parse(op.body);
    if ((m[1] in archivos) && b.sha !== archivos.__sha[m[1]]) return json(409, { message: 'sha does not match' });
    archivos[m[1]] = JSON.parse(Buffer.from(b.content, 'base64').toString('utf8'));
    archivos.__sha[m[1]] = 'sha' + (++version);
    return json(200, { content: { sha: archivos.__sha[m[1]] } });
  }
  return json(404, { message: 'ruta desconocida ' + ruta });
};

// ---------- Petición y respuesta como las de Vercel ----------
function llamar(handler, { method = 'GET', llave, query = {}, body } = {}) {
  return new Promise((resolve) => {
    const req = { method, query, body, headers: llave ? { authorization: 'Bearer ' + llave } : {} };
    const res = { _h: {}, statusCode: 200,
      setHeader(k, v) { this._h[k] = v; }, status(c) { this.statusCode = c; return this; },
      json(c) { resolve({ status: this.statusCode, cuerpo: c }); }, end() { resolve({ status: this.statusCode }); } };
    handler(req, res);
  });
}

const { default: aviso } = await import('../api/aviso.js');
const { default: datos } = await import('../api/datos.js');
const { default: resumen } = await import('../api/resumen.js');
const { default: emparejar } = await import('../api/emparejar.js');
const { olvidarCache } = await import('../lib/llaves.js');

beforeEach(() => { reiniciar(); olvidarCache(); });

test('Sin llave no entra', async () => {
  const r = await llamar(resumen);
  assert.equal(r.status, 401);
});

test('Una llave revocada o inventada no entra', async () => {
  const r = await llamar(resumen, { llave: 'otra' });
  assert.equal(r.status, 401);
});

test('Atajos entrega un aviso y queda como issue con su fuente', async () => {
  const r = await llamar(aviso, { method: 'POST', llave: 'llave-atajos', body: { fuente: 'copec', asunto: 'Tu compra', texto: 'Monto $5.000' } });
  assert.equal(r.status, 201);
  assert.equal(issues[0].title, 'Tu compra');
  assert.match(issues[0].body, /^Fuente: copec\nMonto \$5\.000/);
});

test('Atajos puede enviar el aviso como texto simple', async () => {
  const r = await llamar(aviso, { method: 'POST', llave: 'llave-atajos', body: 'Te informamos que se ha realizado una compra' });
  assert.equal(r.status, 201);
  assert.equal(issues[0].title, 'Aviso');
});

test('La llave de Atajos no lee datos, y la de widget solo el resumen', async () => {
  assert.equal((await llamar(datos, { llave: 'llave-atajos', query: { archivo: 'cuentas.json' } })).status, 403);
  assert.equal((await llamar(datos, { llave: 'llave-widget', query: { archivo: 'cuentas.json' } })).status, 403);
  assert.equal((await llamar(resumen, { llave: 'llave-widget' })).status, 200);
  assert.equal((await llamar(aviso, { method: 'POST', llave: 'llave-widget', body: { texto: 'x' } })).status, 403);
});

test('Un dispositivo lee y escribe con control de versión', async () => {
  const l = await llamar(datos, { llave: 'llave-iphone', query: { archivo: 'cuentas.json' } });
  assert.equal(l.status, 200);
  const e = await llamar(datos, { method: 'PUT', llave: 'llave-iphone', query: { archivo: 'cuentas.json' }, body: { contenido: { cuentas: [1] }, sha: l.cuerpo.sha } });
  assert.equal(e.status, 200);
  // Escribir otra vez con el sha viejo: alguien cambió el archivo entre medio
  const v = await llamar(datos, { method: 'PUT', llave: 'llave-iphone', query: { archivo: 'cuentas.json' }, body: { contenido: { cuentas: [2] }, sha: l.cuerpo.sha } });
  assert.equal(v.status, 409);
  assert.deepEqual(archivos['cuentas.json'], { cuentas: [1] });
});

test('Archivos fuera de la lista y archivos calculados', async () => {
  assert.equal((await llamar(datos, { llave: 'llave-iphone', query: { archivo: 'dispositivos.json' } })).status, 400);
  assert.equal((await llamar(datos, { llave: 'llave-iphone', query: { archivo: '../secreto.json' } })).status, 400);
  assert.equal((await llamar(datos, { method: 'PUT', llave: 'llave-iphone', query: { archivo: 'resumen.json' }, body: { contenido: {} } })).status, 403);
  assert.equal((await llamar(datos, { llave: 'llave-iphone', query: { archivo: 'movimientos/2026-11.json' } })).status, 200);
});

test('Un código se canjea una vez por una llave que funciona, y solo se guarda su huella', async () => {
  const r = await llamar(emparejar, { method: 'POST', body: { codigo: 'abcd-2345' } });
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.nombre, 'iPad');
  assert.ok(r.cuerpo.llave.length >= 40);
  assert.ok(!JSON.stringify(archivos['dispositivos.json']).includes(r.cuerpo.llave));
  assert.equal(archivos['dispositivos.json'].pendientes.length, 0);
  assert.equal((await llamar(resumen, { llave: r.cuerpo.llave })).status, 200);
  assert.equal((await llamar(emparejar, { method: 'POST', body: { codigo: 'ABCD2345' } })).status, 400);
});

test('Un código vencido no sirve', async () => {
  archivos['dispositivos.json'].pendientes[0].vence = new Date(Date.now() - 1000).toISOString();
  assert.equal((await llamar(emparejar, { method: 'POST', body: { codigo: 'ABCD2345' } })).status, 400);
});
