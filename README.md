# domesticas-api

Función de las apps domésticas, publicada en **https://domesticas-api.vercel.app** (Vercel, proyecto
`domesticas-api`). Es la única que tiene el token de GitHub: las apps, Atajos y los widgets entran con su propia
llave, que se puede revocar sin tocar nada más. Los datos viven en el repositorio privado `pablocarvallo/datos`.

## Rutas

| Ruta | Para qué | Llave |
| --- | --- | --- |
| `GET /api/estado` | Revisar que la función está publicada y tiene el token | Ninguna |
| `POST /api/aviso` | Atajos entrega un correo de aviso: `{ "fuente": "bancochile" \| "copec", "asunto": "…", "texto": "…" }`. Queda en `avisos/AAAA-MM/<huella>.json`; si ese correo ya llegó, responde 200 con `repetido` | Atajos |
| `GET /api/datos?archivo=…` | Leer un archivo de datos: `{ contenido, sha }` | Dispositivo |
| `GET /api/datos?carpeta=movimientos` | Meses con movimientos | Dispositivo |
| `PUT /api/datos?archivo=…` | Guardar `{ contenido, sha, mensaje }`; responde 409 si otro dispositivo lo cambió antes | Dispositivo |
| `GET /api/resumen` | Saldos, últimos movimientos, sábanas y alertas | Dispositivo o widget |
| `POST /api/emparejar` | Canjear un código de un solo uso por una llave | Ninguna (el código) |
| `GET /api/lecturas?vista=biblioteca` | Goodreads para la pestaña Lecturas de Consulta: leyendo, quiero leer, leídos, perfil y desafíos (copia de 10 minutos; `&nuevo=1` lee de nuevo). También `vista=buscar&q=…` y `vista=libro&id=…`. Lee las páginas públicas con `lib/goodreads.js`, que viene de pablocarvallo/lecturas | Dispositivo |
| `/emparejar.html` | Página para canjear el código | — |

La llave va en el encabezado `Authorization: Bearer <llave>`. Archivos permitidos: `cuentas`, `pagos`, `creditos`,
`gastos-medicos`, `mesadas`, `ciclos`, `rutinas`, `maletas`, `cartelera`, `resumen` y `salud` (`.json`), y
`movimientos/AAAA-MM.json`. `resumen.json` y `salud.json` solo se leen: los calculan las tareas de `datos`.

## Configuración en Vercel

- Variable `GITHUB_TOKEN` (tipo Secret, Production): token de grano fino solo para `pablocarvallo/datos`, con
  Contents en lectura y escritura (Issues ya no se usa). Vence el 23/11/2027 o en la fecha que se haya elegido: renovarlo antes y
  reemplazar el valor.
- Opcional: `DATOS_REPO` si el repositorio de datos cambia de nombre.

## Emparejar un dispositivo

1. En `pablocarvallo/datos`: **Actions → Llaves → Run workflow**, con acción `crear`, un nombre y el tipo
   (`dispositivo` para una app, `atajos` para la automatización de avisos, `widget` para un widget).
2. Abrir la ejecución: el código aparece en su resumen. Vale 15 minutos.
3. Canjearlo en https://domesticas-api.vercel.app/emparejar.html y copiar la llave donde corresponda.
4. Para quitar una llave: misma tarea, acción `revocar` con su id.

## Conectar Atajos (avisos de cargo)

Durante el mes de convivencia, la automatización sigue enviando cada correo al buzón antiguo (para FAN, Master y
Copec) y **además** a esta función. En cada automatización de Mail (Banco de Chile y Copec Pay) se agrega al final
la acción **Obtener contenido de la URL**:

- URL: `https://domesticas-api.vercel.app/api/aviso`
- Método: `POST`
- Encabezados: `Authorization` = `Bearer ` y la llave de tipo `atajos`
- Cuerpo de la solicitud: JSON con tres campos de texto: `fuente` (`bancochile` o `copec`), `asunto` (el asunto
  del correo) y `texto` (el contenido del correo)

Las dos automatizaciones se activan con cada correo reenviado desde la cuenta propia, así que cada correo llega dos
veces. La función guarda cada aviso con la huella de su asunto y texto, y la segunda vez lo reconoce y no lo guarda.
Los avisos no se dejan como issues para que GitHub no mande un correo por cada uno.

## Pruebas

`node --test pruebas/*.test.mjs` (con un GitHub falso en memoria).
