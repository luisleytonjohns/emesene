// eMeSeNe, lógica principal (fase 1)
import { firebaseConfig, VERSION } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  orderBy, limit, limitToLast, onSnapshot, writeBatch, serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {
  getDatabase, ref, set, onValue, onDisconnect, serverTimestamp as ahoraRtdb, remove
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-database.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'es';
const fs = getFirestore(app);
const rtdb = getDatabase(app);

/* =========================================================
   Utilidades
   ========================================================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return e;
}

function svgUso(id) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
}

const ms = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : 0;
const esCelular = () => window.matchMedia('(max-width: 820px)').matches;
const tactil = () => window.matchMedia('(pointer: coarse)').matches;

function mostrar(id) {
  $$('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === id));
}

function iniciales(nick) {
  const partes = String(nick || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[1][0]).toUpperCase();
}

const COLORES = ['#2D5F8A', '#6A4C93', '#B5472F', '#2F7A5B', '#8C5A1E', '#1F6FB2', '#7A3E65', '#3D6B6B'];
const colorAlAzar = () => COLORES[Math.floor(Math.random() * COLORES.length)];

const ESTADOS = {
  on: 'Conectado',
  away: 'Ausente',
  busy: 'Ocupado',
  off: 'Aparecer sin conexión'
};
const ESTADO_VISTO = { on: 'Conectado', away: 'Ausente', busy: 'Ocupado', off: 'Sin conexión' };

function avatar(perfil, tam, estado) {
  const p = perfil || {};
  const dentro = el('div', { class: 'avatar-dentro', style: `background:${p.color || COLORES[0]};font-size:${Math.round(tam * 0.34)}px` });
  if (p.photo) dentro.append(el('img', { src: p.photo, alt: '' }));
  else dentro.textContent = iniciales(p.nick);
  return el('div', { class: 'avatar ' + (estado || 'off'), style: `width:${tam}px;height:${tam}px` }, dentro);
}

function hora(fecha) {
  return fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
function etiquetaDia(fecha) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha); d.setHours(0, 0, 0, 0);
  const dif = Math.round((hoy - d) / 86400000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Ayer';
  return fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function traducirError(e) {
  const c = e && e.code ? e.code : '';
  const mapa = {
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Prueba iniciando sesión.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
    'auth/wrong-password': 'El correo o la contraseña no son correctos.',
    'auth/user-not-found': 'No hay ninguna cuenta con ese correo.',
    'auth/missing-password': 'Escribe tu contraseña.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
    'auth/network-request-failed': 'No hay conexión a internet.',
    'permission-denied': 'No tienes permiso para hacer eso.',
    'unavailable': 'No hay conexión con el servidor. Revisa tu internet.'
  };
  return mapa[c] || (typeof e === 'string' ? e : 'Ocurrió un error. Vuelve a intentarlo.' + (c ? ` (${c})` : ''));
}

function leerArchivoComoDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function cargarImagen(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('imagen')); };
    img.src = url;
  });
}

// Reduce una foto para que quepa en la base de datos
async function comprimirFoto(file) {
  const img = await cargarImagen(file);
  const intentos = [[1280, 0.72], [1024, 0.62], [800, 0.55], [640, 0.5]];
  for (const [max, calidad] of intentos) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', calidad);
    if (data.length < 900000) return data;
  }
  throw new Error('La foto es demasiado grande.');
}

// Foto de perfil cuadrada y pequeña
async function fotoPerfil(file) {
  const img = await cargarImagen(file);
  const lado = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = 192; c.height = 192;
  c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 192, 192);
  return c.toDataURL('image/jpeg', 0.82);
}

/* =========================================================
   Emoticones
   ========================================================= */
const CARA = '<circle cx="12" cy="12" r="10.5" fill="#F2C230" stroke="#B88A10"/>';
const OJOS = '<circle cx="8.5" cy="9.5" r="1.3" fill="#5A3E00"/><circle cx="15.5" cy="9.5" r="1.3" fill="#5A3E00"/>';
const TRAZO = 'stroke="#5A3E00" stroke-width="1.6" fill="none" stroke-linecap="round"';
const EMOS = [
  [':)', 'Sonrisa', CARA + OJOS + `<path d="M7.5 14c1.5 2.8 7.5 2.8 9 0" ${TRAZO}/>`],
  [':D', 'Risa', CARA + OJOS + '<path d="M7 13h10a5 5 0 0 1-10 0z" fill="#5A3E00"/>'],
  [';)', 'Guiño', CARA + `<path d="M7 9.5h3" ${TRAZO}/><circle cx="15.5" cy="9.5" r="1.3" fill="#5A3E00"/><path d="M7.5 14c1.5 2.8 7.5 2.8 9 0" ${TRAZO}/>`],
  [':P', 'Lengua', CARA + OJOS + `<path d="M8 14h8" ${TRAZO}/><path d="M11 14h3.5v2.5a1.75 1.75 0 0 1-3.5 0z" fill="#E5606B"/>`],
  [':(', 'Triste', CARA + OJOS + `<path d="M7.5 17c1.5-2.8 7.5-2.8 9 0" ${TRAZO}/>`],
  [':O', 'Sorpresa', CARA + OJOS + '<ellipse cx="12" cy="15.5" rx="2.4" ry="3" fill="#5A3E00"/>'],
  [':S', 'Confundido', CARA + OJOS + `<path d="M7 15.5c1.2-1.5 2.3-1.5 3.3 0s2.2 1.5 3.4 0 2.2-1.5 3.3 0" ${TRAZO}/>`],
  ['(L)', 'Corazón', '<path d="M12 20.5S3 15 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 6-9 11.5-9 11.5z" fill="#D8343F"/>'],
  ['(U)', 'Corazón roto', '<path d="M12 20.5S3 15 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 6-9 11.5-9 11.5z" fill="#D8343F"/><path d="M12 8l-1.5 3.5 2.5 2-1.5 5" stroke="#FFFFFF" stroke-width="1.6" fill="none"/>'],
  ['(C)', 'Café', '<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" fill="#8C5A1E"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" stroke="#8C5A1E" stroke-width="2" fill="none"/><path d="M8 3c-1 1.5 1 2 0 4M12 3c-1 1.5 1 2 0 4" stroke="#8A96A3" stroke-width="1.3" fill="none"/>'],
  ['(*)', 'Estrella', '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#F2C230" stroke="#B88A10"/>'],
  ['(Y)', 'Bien', '<path d="M3 11h4v9H3z" fill="#2D5F8A"/><path d="M7 11l4-7c1.5 0 2.5 1 2 3l-1 3h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7z" fill="#F2C230" stroke="#B88A10"/>']
];
const EMO_IMG = new Map(EMOS.map(([c, n, s]) => [
  c.toUpperCase(),
  { src: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${s}</svg>`), nombre: n, codigo: c }
]));
const EMO_RE = new RegExp('(' + EMOS.map(([c]) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
const URL_RE = /(https?:\/\/[^\s<]+)/g;

function emoImg(codigo) {
  const e = EMO_IMG.get(codigo.toUpperCase());
  return el('img', { class: 'emo', src: e.src, alt: e.codigo, title: e.nombre });
}

function textoConEmos(texto) {
  const frag = document.createDocumentFragment();
  String(texto).split(URL_RE).forEach((parte, i) => {
    if (i % 2 === 1) {
      frag.append(el('a', { href: parte, target: '_blank', rel: 'noopener noreferrer' }, parte));
      return;
    }
    parte.split(EMO_RE).forEach((p, j) => {
      if (!p) return;
      if (j % 2 === 1 && EMO_IMG.has(p.toUpperCase())) frag.append(emoImg(p));
      else frag.append(document.createTextNode(p));
    });
  });
  return frag;
}

/* =========================================================
   Sonidos (generados por el navegador)
   ========================================================= */
let ctxAudio = null;
function audio() {
  if (!ctxAudio) {
    try { ctxAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
  return ctxAudio;
}
document.addEventListener('pointerdown', () => audio(), { once: true });

function tono(c, f, ini, dur, tipo = 'sine', vol = 0.14) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, ini);
  g.gain.exponentialRampToValueAtTime(vol, ini + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ini + dur);
  o.connect(g).connect(c.destination);
  o.start(ini); o.stop(ini + dur + 0.02);
}
function sonido(nombre) {
  const c = audio();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  if (nombre === 'mensaje') { tono(c, 880, t, 0.12); tono(c, 1320, t + 0.1, 0.2); }
  else if (nombre === 'conexion') { tono(c, 523, t, 0.14); tono(c, 659, t + 0.11, 0.14); tono(c, 784, t + 0.22, 0.26); }
  else if (nombre === 'solicitud') { tono(c, 660, t, 0.16); tono(c, 990, t + 0.16, 0.24); }
  else if (nombre === 'zumbido') { for (let i = 0; i < 9; i++) tono(c, i % 2 ? 68 : 92, t + i * 0.065, 0.075, 'square', 0.09); }
}

/* =========================================================
   Avisos flotantes
   ========================================================= */
function toast(titulo, texto, perfil, alClic) {
  const cuerpo = el('div', { class: 'toast-texto' }, el('b', {}, titulo), texto ? el('small', {}, texto) : null);
  const t = el(alClic ? 'button' : 'div', { class: 'toast', type: alClic ? 'button' : null },
    perfil ? avatar(perfil, 40, null) : null, cuerpo);
  if (alClic) t.addEventListener('click', () => { alClic(); t.remove(); });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 6000);
}
const aviso = (texto) => toast(texto, '', null, null);

/* =========================================================
   Estado general
   ========================================================= */
let yo = null;               // usuario de Firebase Auth
let miPerfil = null;         // documento users/{uid}
let desuscribirPerfil = null;
let principalIniciado = false;
let registrando = false;
const subs = [];             // desuscripciones de la pantalla principal
const contactos = new Map(); // uid -> datos del contacto
let solEntrantes = [];
let solSalientes = [];
let pendientesAdmin = [];
let chatAbierto = null;
let unsubChat = null;
let unsubEscribiendo = null;
const gruposCerrados = new Set();
let ultimoZumbido = 0;

$('#pie-version').textContent = 'eMeSeNe ' + VERSION;

/* =========================================================
   Sesión
   ========================================================= */
onAuthStateChanged(auth, (u) => {
  if (desuscribirPerfil) { desuscribirPerfil(); desuscribirPerfil = null; }
  detenerPrincipal();
  miPerfil = null;
  yo = u;
  if (!u) { mostrar('pantalla-ingreso'); return; }
  mostrar('cargando');
  desuscribirPerfil = onSnapshot(doc(fs, 'users', u.uid), async (snap) => {
    if (!snap.exists()) {
      // Sin respuesta del servidor no se sabe si el perfil existe: esperar, nunca crear uno a ciegas
      if (snap.metadata.fromCache) { mostrar('cargando'); return; }
      if (!registrando) {
        try { await crearPerfil(u, nickDesdeCorreo(u.email), null); }
        catch (e) { console.error(e); aviso('No se pudo crear tu perfil. Recarga la página.'); }
      }
      return;
    }
    miPerfil = snap.data();
    if (miPerfil.deleted) { detenerPrincipal(); mostrarEspera('eliminada'); return; }
    if (miPerfil.suspended) { detenerPrincipal(); mostrarEspera('suspendida'); return; }
    if (!miPerfil.approved) { detenerPrincipal(); mostrarEspera(miPerfil.rejected ? 'rechazada' : 'pendiente'); return; }
    if (!principalIniciado) iniciarPrincipal();
    else pintarMiPerfil();
  }, (err) => {
    console.error(err);
    mostrar('cargando');
    $('#cargando p').textContent = 'No se pudo conectar con el servidor. Revisa tu internet y recarga la página.';
  });
});

function nickDesdeCorreo(correo) {
  const base = String(correo || 'Usuario').split('@')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

async function crearPerfil(u, nick, codigo) {
  const datos = {
    email: u.email, emailLower: u.email.toLowerCase(), nick: nick.slice(0, 60), msg: '', listening: '',
    status: 'on', color: colorAlAzar(), photo: null, approved: false, admin: false, suspended: false,
    rejected: false, inviteCode: null, createdAt: serverTimestamp()
  };
  if (codigo) {
    try {
      const inv = await getDoc(doc(fs, 'invites', codigo));
      if (inv.exists() && !inv.data().usedBy) {
        const b = writeBatch(fs);
        b.update(doc(fs, 'invites', codigo), { usedBy: u.uid, usedAt: serverTimestamp(), usedEmail: u.email });
        b.set(doc(fs, 'users', u.uid), { ...datos, approved: true, inviteCode: codigo });
        await b.commit();
        return true;
      }
    } catch (e) { console.warn('Código no aplicado', e); }
  }
  await setDoc(doc(fs, 'users', u.uid), datos);
  return false;
}

// Pestañas de ingreso
$$('[data-pestana]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-pestana]').forEach((x) => x.classList.toggle('activa', x === b));
  $('#form-entrar').hidden = b.dataset.pestana !== 'entrar';
  $('#form-crear').hidden = b.dataset.pestana !== 'crear';
  $('#ingreso-error').textContent = ''; $('#ingreso-ok').textContent = '';
}));

$('#form-entrar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const correo = $('#entrar-correo').value.trim();
  const clave = $('#entrar-clave').value;
  $('#ingreso-error').textContent = ''; $('#ingreso-ok').textContent = '';
  if (!correo || !clave) { $('#ingreso-error').textContent = 'Escribe tu correo y tu contraseña.'; return; }
  sessionStorage.setItem('estadoInicial', $('#entrar-estado').value);
  const boton = $('#form-entrar .boton-principal');
  boton.disabled = true; boton.textContent = 'Entrando...';
  try { await signInWithEmailAndPassword(auth, correo, clave); }
  catch (e) {
    console.error(e);
    let texto = traducirError(e);
    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(e.code)) {
      texto += ' Si te enviaron un código de invitación nuevo, usa la pestaña "Crear cuenta".';
    }
    mostrarErrorIngreso(texto);
  } finally { boton.disabled = false; boton.textContent = 'Iniciar sesión'; }
});

function mostrarErrorIngreso(texto) {
  const err = $('#ingreso-error');
  err.textContent = texto;
  err.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#btn-olvide').addEventListener('click', async () => {
  const correo = $('#entrar-correo').value.trim();
  $('#ingreso-error').textContent = ''; $('#ingreso-ok').textContent = '';
  if (!correo) { $('#ingreso-error').textContent = 'Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu contraseña?".'; return; }
  try {
    await sendPasswordResetEmail(auth, correo);
    $('#ingreso-ok').textContent = 'Te enviamos un correo para cambiar la contraseña. Revisa también la carpeta de spam.';
  } catch (e) { $('#ingreso-error').textContent = traducirError(e); }
});

$('#form-crear').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nick = $('#crear-nick').value.trim();
  const correo = $('#crear-correo').value.trim();
  const clave = $('#crear-clave').value;
  const clave2 = $('#crear-clave2').value;
  const codigo = $('#crear-codigo').value.trim().toUpperCase();
  const err = $('#ingreso-error');
  err.textContent = ''; $('#ingreso-ok').textContent = '';
  if (!nick) { err.textContent = 'Escribe tu nick.'; return; }
  if (clave.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  if (clave !== clave2) { err.textContent = 'Las contraseñas no coinciden.'; return; }
  registrando = true;
  const boton = $('#form-crear .boton-principal');
  boton.disabled = true; boton.textContent = 'Creando tu cuenta...';
  try {
    const cred = await createUserWithEmailAndPassword(auth, correo, clave);
    const ok = await crearPerfil(cred.user, nick, codigo || null);
    if (codigo && !ok) aviso('El código no es válido o ya fue usado. Tu cuenta quedó en espera de aprobación.');
  } catch (e) {
    console.error(e);
    mostrarErrorIngreso(traducirError(e));
  } finally {
    registrando = false;
    boton.disabled = false; boton.textContent = 'Crear cuenta';
  }
});

function mostrarEspera(tipo) {
  const titulos = {
    pendiente: ['Tu cuenta está pendiente de aprobación', 'El administrador revisará tu solicitud. Cuando te apruebe, esta pantalla se actualizará sola.'],
    rechazada: ['Tu solicitud no fue aprobada', 'Si crees que es un error, habla con quien te invitó. Si te dio un código, puedes usarlo aquí abajo.'],
    suspendida: ['Tu cuenta está suspendida', 'Habla con el administrador si necesitas volver a usar eMeSeNe.'],
    eliminada: ['Tu cuenta fue eliminada', 'Si crees que es un error, habla con el administrador.']
  };
  $('#espera-titulo').textContent = titulos[tipo][0];
  $('#espera-texto').textContent = titulos[tipo][1];
  $('#form-codigo').hidden = tipo === 'suspendida' || tipo === 'eliminada';
  $('#espera-error').textContent = '';
  mostrar('pantalla-espera');
}

$('#form-codigo').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const codigo = $('#espera-codigo').value.trim().toUpperCase();
  const err = $('#espera-error');
  err.textContent = '';
  if (!codigo) { err.textContent = 'Escribe el código.'; return; }
  try {
    const inv = await getDoc(doc(fs, 'invites', codigo));
    if (!inv.exists() || inv.data().usedBy) { err.textContent = 'El código no es válido o ya fue usado.'; return; }
    const b = writeBatch(fs);
    b.update(doc(fs, 'invites', codigo), { usedBy: yo.uid, usedAt: serverTimestamp(), usedEmail: yo.email });
    b.update(doc(fs, 'users', yo.uid), { approved: true, inviteCode: codigo, rejected: false });
    await b.commit();
  } catch (e) { console.error(e); err.textContent = traducirError(e); }
});

$('#btn-salir-espera').addEventListener('click', () => signOut(auth));
$('#btn-salir').addEventListener('click', cerrarSesion);

async function cerrarSesion() {
  try {
    if (yo) await set(ref(rtdb, 'status/' + yo.uid), { state: 'offline', last: ahoraRtdb() });
  } catch (e) { console.warn(e); }
  await signOut(auth);
}

/* =========================================================
   Pantalla principal
   ========================================================= */
function iniciarPrincipal() {
  principalIniciado = true;
  mostrar('pantalla-principal');
  pintarMiPerfil();
  iniciarPresencia();
  escucharContactos();
  escucharSolicitudes();
  pintarContactos();
  const inicial = sessionStorage.getItem('estadoInicial');
  if (inicial) {
    sessionStorage.removeItem('estadoInicial');
    if (inicial !== miPerfil.status) cambiarEstado(inicial);
  }
  mostrarAvisoIos();
}

function detenerPrincipal() {
  subs.splice(0).forEach((f) => { try { f(); } catch {} });
  contactos.forEach((c) => { c.unsubPerfil?.(); c.unsubEstado?.(); });
  contactos.clear();
  cerrarChat();
  detenerAdmin();
  solEntrantes = []; solSalientes = []; pendientesAdmin = [];
  principalIniciado = false;
  actualizarTitulo();
}

function iniciarPresencia() {
  const miRef = ref(rtdb, 'status/' + yo.uid);
  subs.push(onValue(ref(rtdb, '.info/connected'), (s) => {
    if (s.val() !== true) return;
    onDisconnect(miRef).set({ state: 'offline', last: ahoraRtdb() })
      .then(() => set(miRef, { state: 'online', last: ahoraRtdb() }))
      .catch((e) => console.warn('Presencia', e));
  }));
}

/* ---------- Mi perfil ---------- */
function pintarMiPerfil() {
  if (!miPerfil) return;
  $('#mi-avatar').replaceChildren(avatar(miPerfil, 64, miPerfil.status));
  $('#mi-nick').textContent = miPerfil.nick;
  $('#mi-estado').textContent = '(' + ESTADOS[miPerfil.status || 'on'] + ')';
  if (document.activeElement !== $('#mi-mensaje')) $('#mi-mensaje').value = miPerfil.msg || '';
  $('#mi-escuchando span').textContent = miPerfil.listening ? 'Escuchando: ' + miPerfil.listening : 'Agregar lo que estoy escuchando';
  $('#btn-admin').hidden = !miPerfil.admin;
  if (miPerfil.admin) escucharPendientes(); else detenerPendientes();
  if (chatAbierto) $('#chat-avatar-yo').replaceChildren(avatar(miPerfil, 96, miPerfil.status));
}

async function cambiarEstado(estado) {
  try { await updateDoc(doc(fs, 'users', yo.uid), { status: estado }); }
  catch (e) { aviso(traducirError(e)); }
}

$('#btn-estado').addEventListener('click', (ev) => {
  ev.stopPropagation();
  const menu = $('#menu-estado');
  if (!menu.hidden) { menu.hidden = true; return; }
  menu.replaceChildren(...Object.entries(ESTADOS).map(([k, txt]) =>
    el('button', { type: 'button', role: 'menuitem', onclick: () => { menu.hidden = true; cambiarEstado(k); } },
      el('span', { class: 'punto ' + k }), txt)));
  menu.hidden = false;
  $('#btn-estado').setAttribute('aria-expanded', 'true');
});

document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#menu-estado, #btn-estado')) { $('#menu-estado').hidden = true; $('#btn-estado').setAttribute('aria-expanded', 'false'); }
  if (!ev.target.closest('#chat-menu, #chat-menu-btn')) $('#chat-menu').hidden = true;
  if (!ev.target.closest('#panel-emo, #btn-emo')) $('#panel-emo').hidden = true;
});

async function guardarMensajePersonal() {
  const v = $('#mi-mensaje').value.trim().slice(0, 140);
  if (!miPerfil || v === (miPerfil.msg || '')) return;
  try { await updateDoc(doc(fs, 'users', yo.uid), { msg: v }); } catch (e) { aviso(traducirError(e)); }
}
$('#mi-mensaje').addEventListener('change', guardarMensajePersonal);
$('#mi-mensaje').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); } });

/* ---------- Diálogo de perfil ---------- */
let fotoNueva;  // undefined = sin cambio, null = quitar, string = nueva
let colorNuevo;
function pintarAvatarPerfil() {
  const p = { ...miPerfil, color: colorNuevo, photo: fotoNueva === undefined ? miPerfil.photo : fotoNueva, nick: $('#perfil-nick').value || miPerfil.nick };
  $('#perfil-avatar').replaceChildren(avatar(p, 80, miPerfil.status));
}
function abrirPerfil() {
  fotoNueva = undefined;
  colorNuevo = miPerfil.color || COLORES[0];
  $('#perfil-nick').value = miPerfil.nick || '';
  $('#perfil-mensaje').value = miPerfil.msg || '';
  $('#perfil-escuchando').value = miPerfil.listening || '';
  $('#perfil-colores').replaceChildren(...COLORES.map((c) => el('button', {
    type: 'button', class: 'color-opcion' + (c === colorNuevo ? ' elegido' : ''), style: 'background:' + c,
    'aria-label': 'Color ' + c,
    onclick: (ev) => { colorNuevo = c; $$('.color-opcion').forEach((b) => b.classList.toggle('elegido', b === ev.currentTarget)); pintarAvatarPerfil(); }
  })));
  pintarAvatarPerfil();
  $('#dlg-perfil').showModal();
}
$('#mi-avatar').addEventListener('click', abrirPerfil);
$('#mi-escuchando').addEventListener('click', () => { abrirPerfil(); setTimeout(() => $('#perfil-escuchando').focus(), 50); });
$('#perfil-nick').addEventListener('input', pintarAvatarPerfil);
$('#perfil-cambiar-foto').addEventListener('click', () => $('#perfil-input-foto').click());
$('#perfil-quitar-foto').addEventListener('click', () => { fotoNueva = null; pintarAvatarPerfil(); });
$('#perfil-input-foto').addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try { fotoNueva = await fotoPerfil(f); pintarAvatarPerfil(); } catch { aviso('No se pudo leer esa imagen.'); }
});
$('#form-perfil').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nick = $('#perfil-nick').value.trim();
  if (!nick) { $('#perfil-nick').focus(); return; }
  const cambios = {
    nick: nick.slice(0, 60),
    msg: $('#perfil-mensaje').value.trim().slice(0, 140),
    listening: $('#perfil-escuchando').value.trim().slice(0, 100),
    color: colorNuevo
  };
  if (fotoNueva !== undefined) cambios.photo = fotoNueva;
  try { await updateDoc(doc(fs, 'users', yo.uid), cambios); $('#dlg-perfil').close(); }
  catch (e) { aviso(traducirError(e)); }
});

$$('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

/* ---------- Contactos ---------- */
function estadoVisible(c) {
  const p = c.perfil;
  if (!p || !c.online || p.suspended || p.status === 'off') return 'off';
  return p.status || 'on';
}

function escucharContactos() {
  let primera = true;
  subs.push(onSnapshot(collection(fs, 'users', yo.uid, 'contacts'), (snap) => {
    snap.docChanges().forEach((ch) => {
      const id = ch.doc.id;
      if (ch.type === 'removed') { quitarContacto(id); return; }
      const rel = ch.doc.data({ serverTimestamps: 'estimate' });
      let c = contactos.get(id);
      if (!c) {
        c = { id, rel, perfil: null, online: false, perfilListo: false, estadoListo: false, visible: 'off' };
        contactos.set(id, c);
        suscribirContacto(c);
        if (!primera) { sonido('conexion'); }
      } else {
        const antes = c.rel;
        c.rel = rel;
        if (!primera) revisarNovedades(c, antes, rel, ch.doc.metadata.hasPendingWrites);
      }
    });
    primera = false;
    pintarContactos();
    actualizarTitulo();
  }, (e) => console.error('Contactos', e)));
}

function suscribirContacto(c) {
  c.unsubPerfil = onSnapshot(doc(fs, 'users', c.id), (s) => {
    c.perfil = s.exists() ? s.data() : null;
    c.perfilListo = true;
    revisarConexion(c);
  }, (e) => console.warn('Perfil de contacto', e));
  c.unsubEstado = onValue(ref(rtdb, 'status/' + c.id), (s) => {
    c.online = !!(s.val() && s.val().state === 'online');
    c.estadoListo = true;
    revisarConexion(c);
  });
}

function revisarConexion(c) {
  const v = estadoVisible(c);
  if (c.listo && c.visible === 'off' && v !== 'off') {
    sonido('conexion');
    toast(c.perfil.nick, 'acaba de iniciar sesión', c.perfil, () => abrirChat(c.id));
  }
  c.visible = v;
  if (c.perfilListo && c.estadoListo) c.listo = true;
  pintarContactos();
  if (chatAbierto === c.id) pintarCabeceraChat();
}

function quitarContacto(id) {
  const c = contactos.get(id);
  if (!c) return;
  c.unsubPerfil?.(); c.unsubEstado?.();
  contactos.delete(id);
  if (chatAbierto === id) cerrarChat();
}

function revisarNovedades(c, antes, ahora, propio) {
  if (propio) return;
  if (ms(ahora.buzzAt) > ms(antes.buzzAt)) { recibirZumbido(c); return; }
  if ((ahora.unread || 0) > (antes.unread || 0)) recibirMensaje(c, ahora.lastText);
}

function recibirMensaje(c, texto) {
  const nick = c.perfil ? c.perfil.nick : 'Alguien';
  if (chatAbierto === c.id && document.visibilityState === 'visible') {
    marcarLeido(c.id);
    sonido('mensaje');
    return;
  }
  sonido('mensaje');
  toast(nick + ' dice:', texto || '', c.perfil, () => abrirChat(c.id));
}

function recibirZumbido(c) {
  sonido('zumbido');
  if (navigator.vibrate) navigator.vibrate([200, 80, 200, 80, 300]);
  abrirChat(c.id);
  temblar();
}

function temblar() {
  const v = esCelular() ? $('#ventana-chat') : $('#escritorio');
  v.classList.remove('temblando');
  void v.offsetWidth;
  v.classList.add('temblando');
  setTimeout(() => v.classList.remove('temblando'), 700);
}

$('#buscar').addEventListener('input', () => pintarContactos());

function pintarContactos() {
  if (!principalIniciado) return;
  const filtro = $('#buscar').value.trim().toLowerCase();
  const lista = Array.from(contactos.values())
    .filter((c) => c.perfil)
    .filter((c) => !filtro || c.perfil.nick.toLowerCase().includes(filtro) || (c.perfil.email || '').toLowerCase().includes(filtro))
    .sort((a, b) => a.perfil.nick.localeCompare(b.perfil.nick, 'es'));
  const conectados = lista.filter((c) => estadoVisible(c) !== 'off');
  const desconectados = lista.filter((c) => estadoVisible(c) === 'off');
  const cont = $('#lista-contactos');
  const nodos = [];

  if (!contactos.size && !solSalientes.length) {
    nodos.push(el('p', { class: 'lista-vacia' }, 'Todavía no tienes contactos. Toca el botón de agregar e invita a alguien con su correo.'));
  }
  const grupo = (clave, titulo, items) => {
    const abierto = !gruposCerrados.has(clave);
    nodos.push(el('button', {
      type: 'button', class: 'grupo-titulo' + (abierto ? ' abierto' : ''), 'aria-expanded': String(abierto),
      onclick: () => { abierto ? gruposCerrados.add(clave) : gruposCerrados.delete(clave); pintarContactos(); }
    }, svgUso('i-flecha'), `${titulo} (${items.length})`));
    if (!abierto) return;
    items.forEach((c) => nodos.push(filaContacto(c)));
  };
  if (contactos.size) {
    grupo('on', 'Conectados', conectados);
    grupo('off', 'Sin conexión', desconectados);
  }
  if (solSalientes.length) {
    nodos.push(el('div', { class: 'grupo-titulo abierto', style: 'cursor:default' }, `Esperando respuesta (${solSalientes.length})`));
    solSalientes.forEach((s) => nodos.push(el('div', { class: 'saliente' },
      el('span', {}, s.toEmail || 'Solicitud enviada'),
      el('button', { type: 'button', class: 'enlace', onclick: () => deleteDoc(doc(fs, 'requests', s.id)).catch((e) => aviso(traducirError(e))) }, 'Cancelar'))));
  }
  cont.replaceChildren(...nodos);
}

function filaContacto(c) {
  const v = estadoVisible(c);
  const p = c.perfil;
  const extra = p.listening ? 'Escuchando: ' + p.listening : (p.msg || '');
  const unread = c.rel && c.rel.unread ? c.rel.unread : 0;
  return el('button', {
    type: 'button', class: 'contacto' + (v === 'off' ? ' desconectado' : '') + (chatAbierto === c.id ? ' activo' : ''),
    onclick: () => abrirChat(c.id), title: p.email || ''
  },
  el('span', { class: 'punto ' + v }),
  el('span', { class: 'contacto-texto' },
    el('span', { class: 'contacto-nick' }, textoConEmos(p.nick)),
    extra ? el('span', { class: 'contacto-msg' }, ' · ', textoConEmos(extra)) : null),
  unread ? el('span', { class: 'no-leidos', 'aria-label': unread + ' mensajes sin leer' }, String(unread)) : null);
}

function actualizarTitulo() {
  let total = 0;
  contactos.forEach((c) => { total += (c.rel && c.rel.unread) || 0; });
  document.title = total ? `(${total}) eMeSeNe` : 'eMeSeNe';
  if (navigator.setAppBadge) { (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {}); }
}

/* ---------- Solicitudes ---------- */
function escucharSolicitudes() {
  let primera = true;
  subs.push(onSnapshot(query(collection(fs, 'requests'), where('to', '==', yo.uid)), (s) => {
    if (!primera) {
      s.docChanges().filter((ch) => ch.type === 'added').forEach((ch) => {
        sonido('solicitud');
        toast(ch.doc.data().fromNick || 'Alguien', 'quiere agregarte como contacto', null, null);
      });
    }
    primera = false;
    solEntrantes = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    pintarSolicitudes();
  }, (e) => console.error('Solicitudes', e)));
  subs.push(onSnapshot(query(collection(fs, 'requests'), where('from', '==', yo.uid)), (s) => {
    solSalientes = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    pintarContactos();
  }, (e) => console.error('Solicitudes enviadas', e)));
}

function pintarSolicitudes() {
  $('#solicitudes').replaceChildren(...solEntrantes.map((s) => el('div', { class: 'solicitud' },
    el('span', {}, el('b', {}, s.fromNick || 'Alguien'), ` (${s.fromEmail || ''}) quiere agregarte como contacto`),
    el('button', { type: 'button', class: 'boton-azul', onclick: () => aceptarSolicitud(s) }, 'Aceptar'),
    el('button', { type: 'button', class: 'boton-blanco', onclick: () => rechazarSolicitud(s) }, 'Rechazar'))));
}

async function aceptarSolicitud(s) {
  try {
    const b = writeBatch(fs);
    b.set(doc(fs, 'users', yo.uid, 'contacts', s.from), { since: serverTimestamp(), unread: 0 });
    b.set(doc(fs, 'users', s.from, 'contacts', yo.uid), { since: serverTimestamp(), unread: 0 });
    b.delete(doc(fs, 'requests', s.id));
    await b.commit();
  } catch (e) { console.error(e); aviso(traducirError(e)); }
}

async function rechazarSolicitud(s) {
  try { await deleteDoc(doc(fs, 'requests', s.id)); } catch (e) { aviso(traducirError(e)); }
}

/* ---------- Agregar contacto ---------- */
$('#btn-agregar').addEventListener('click', () => {
  $('#agregar-correo').value = '';
  $('#agregar-msg').textContent = '';
  $('#agregar-msg').className = 'mensaje-error';
  $('#dlg-agregar').showModal();
});

$('#form-agregar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#agregar-msg');
  const correo = $('#agregar-correo').value.trim().toLowerCase();
  msg.className = 'mensaje-error'; msg.textContent = '';
  if (!correo) return;
  try {
    if (correo === (yo.email || '').toLowerCase()) throw 'Ese es tu propio correo.';
    const s = await getDocs(query(collection(fs, 'users'), where('emailLower', '==', correo), limit(1)));
    if (s.empty || !s.docs[0].data().approved || s.docs[0].data().suspended) throw 'No encontramos a nadie con ese correo en eMeSeNe. Pídele que cree su cuenta primero.';
    const otro = s.docs[0];
    const nick = otro.data().nick;
    if (contactos.has(otro.id)) throw `${nick} ya está en tus contactos.`;
    const inversa = solEntrantes.find((x) => x.from === otro.id);
    if (inversa) {
      await aceptarSolicitud(inversa);
      msg.className = 'mensaje-ok'; msg.textContent = `${nick} ya te había invitado, así que quedaron conectados.`;
      return;
    }
    if (solSalientes.find((x) => x.to === otro.id)) throw `Ya le enviaste una solicitud a ${nick}. Falta que la acepte.`;
    await setDoc(doc(fs, 'requests', yo.uid + '_' + otro.id), {
      from: yo.uid, to: otro.id, fromNick: miPerfil.nick, fromEmail: yo.email, toEmail: otro.data().email, createdAt: serverTimestamp()
    });
    msg.className = 'mensaje-ok';
    msg.textContent = `Listo, le enviamos tu solicitud a ${nick}.`;
    $('#agregar-correo').value = '';
  } catch (e) {
    console.warn(e);
    msg.className = 'mensaje-error';
    msg.textContent = typeof e === 'string' ? e : traducirError(e);
  }
});

/* =========================================================
   Conversación
   ========================================================= */
const idChat = (a, b) => [a, b].sort().join('_');

function abrirChat(id) {
  if (!contactos.has(id)) return;
  if (chatAbierto === id) { document.body.classList.add('con-chat'); return; }
  cerrarChat();
  chatAbierto = id;
  const cid = idChat(yo.uid, id);
  $('#chat').hidden = false;
  $('#chat-vacio').hidden = true;
  document.body.classList.add('con-chat');
  $('#mensajes').replaceChildren();
  $('#escribiendo').textContent = '';
  $('#texto').value = '';
  pintarCabeceraChat();
  unsubChat = onSnapshot(
    query(collection(fs, 'chats', cid, 'msgs'), orderBy('createdAt'), limitToLast(150)),
    (s) => pintarMensajes(s.docs),
    (e) => { console.error('Mensajes', e); aviso('No se pudieron cargar los mensajes.'); }
  );
  unsubEscribiendo = onValue(ref(rtdb, `typing/${cid}/${id}`), (s) => {
    const c = contactos.get(id);
    $('#escribiendo').textContent = s.val() && c && c.perfil ? `${c.perfil.nick} está escribiendo...` : '';
  });
  marcarLeido(id);
  pintarContactos();
  if (!tactil()) setTimeout(() => $('#texto').focus(), 50);
}

function cerrarChat() {
  if (unsubChat) { unsubChat(); unsubChat = null; }
  if (unsubEscribiendo) { unsubEscribiendo(); unsubEscribiendo = null; }
  pararEscribir();
  cancelarGrabacion();
  chatAbierto = null;
  $('#chat').hidden = true;
  $('#chat-vacio').hidden = false;
  $('#panel-emo').hidden = true;
  document.body.classList.remove('con-chat');
  pintarContactos();
}

$('#chat-volver').addEventListener('click', cerrarChat);

function marcarLeido(id) {
  const c = contactos.get(id);
  if (c && c.rel && c.rel.unread) {
    updateDoc(doc(fs, 'users', yo.uid, 'contacts', id), { unread: 0 }).catch((e) => console.warn(e));
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && chatAbierto) marcarLeido(chatAbierto);
});

function pintarCabeceraChat() {
  const c = contactos.get(chatAbierto);
  if (!c || !c.perfil) return;
  const v = estadoVisible(c);
  const p = c.perfil;
  $('#chat-titulo').textContent = p.nick + ' · Conversación';
  $('#chat-punto').className = 'punto ' + v;
  $('#chat-nick').replaceChildren(textoConEmos(p.nick));
  const sub = [ESTADO_VISTO[v], p.listening ? 'Escuchando: ' + p.listening : p.msg].filter(Boolean).join(' · ');
  $('#chat-sub').replaceChildren(textoConEmos(sub));
  $('#chat-avatar-otro').replaceChildren(avatar(p, 128, v));
  $('#chat-avatar-yo').replaceChildren(avatar(miPerfil, 96, miPerfil.status));
}

function pintarMensajes(docs) {
  const caja = $('#mensajes');
  const abajo = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 80;
  const c = contactos.get(chatAbierto);
  const nickOtro = c && c.perfil ? c.perfil.nick : 'Contacto';
  const nodos = [];
  let ultimoQuien = null;
  let ultimoDia = '';
  let ultimoEsMio = false;
  docs.forEach((d) => {
    const m = d.data({ serverTimestamps: 'estimate' });
    const fecha = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate() : new Date();
    const dia = fecha.toDateString();
    if (dia !== ultimoDia) { nodos.push(el('div', { class: 'msg-fecha' }, etiquetaDia(fecha))); ultimoDia = dia; ultimoQuien = null; }
    const mio = m.from === yo.uid;
    ultimoEsMio = mio;
    if (m.type === 'buzz') {
      nodos.push(el('div', { class: 'msg-sistema' }, mio ? 'Has enviado un zumbido.' : `${nickOtro} te ha enviado un zumbido.`));
      ultimoQuien = null;
      return;
    }
    if (ultimoQuien !== m.from) {
      nodos.push(el('div', { class: 'msg-quien' }, `${mio ? miPerfil.nick : nickOtro} dice (${hora(fecha)}):`));
      ultimoQuien = m.from;
    }
    if (m.type === 'text') {
      nodos.push(el('div', { class: 'msg-texto' + (mio ? '' : ' de-otro') }, textoConEmos(m.text || '')));
    } else if (m.type === 'photo' && m.data) {
      nodos.push(el('div', { class: 'msg-foto' }, el('img', { src: m.data, alt: 'Foto enviada', loading: 'lazy', onclick: () => verFoto(m.data) })));
    } else if (m.type === 'voice' && m.data) {
      nodos.push(el('div', { class: 'msg-voz' }, el('audio', { controls: true, preload: 'metadata', src: m.data })));
    }
  });
  if (!docs.length) nodos.push(el('p', { class: 'gris', style: 'margin:auto;text-align:center' }, `Saluda a ${nickOtro}. :)`));
  caja.replaceChildren(...nodos);
  if (abajo || ultimoEsMio) caja.scrollTop = caja.scrollHeight;
  if (chatAbierto && document.visibilityState === 'visible') marcarLeido(chatAbierto);
}

function verFoto(src) {
  $('#visor-img').src = src;
  $('#visor').hidden = false;
}
$('#visor').addEventListener('click', () => { $('#visor').hidden = true; $('#visor-img').removeAttribute('src'); });

/* ---------- Envío ---------- */
async function enviar(datos, resumen, esZumbido = false) {
  const id = chatAbierto;
  if (!id) return;
  const cid = idChat(yo.uid, id);
  const b = writeBatch(fs);
  b.set(doc(collection(fs, 'chats', cid, 'msgs')), { from: yo.uid, createdAt: serverTimestamp(), ...datos });
  const aviso2 = { lastAt: serverTimestamp(), lastText: String(resumen).slice(0, 120), unread: increment(1) };
  if (esZumbido) aviso2.buzzAt = serverTimestamp();
  b.update(doc(fs, 'users', id, 'contacts', yo.uid), aviso2);
  try { await b.commit(); }
  catch (e) {
    console.error(e);
    aviso(e.code === 'not-found' ? 'Esta persona ya no te tiene en sus contactos.' : traducirError(e));
    throw e;
  }
}

$('#form-mensaje').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const t = $('#texto').value.trim();
  if (!t) return;
  $('#texto').value = '';
  pararEscribir();
  try { await enviar({ type: 'text', text: t.slice(0, 4000) }, t); }
  catch { $('#texto').value = t; }
});

// Al abrir el teclado en el celular, mantener visibles los últimos mensajes
$('#texto').addEventListener('focus', () => {
  setTimeout(() => { const c = $('#mensajes'); c.scrollTop = c.scrollHeight; }, 350);
});

$('#texto').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey && !tactil()) {
    ev.preventDefault();
    $('#form-mensaje').requestSubmit();
  }
});

// Aviso de "está escribiendo"
let tEscribiendo = null;
let escribiendoActivo = false;
$('#texto').addEventListener('input', () => {
  if (!chatAbierto) return;
  if (!escribiendoActivo) {
    const r = ref(rtdb, `typing/${idChat(yo.uid, chatAbierto)}/${yo.uid}`);
    set(r, true).catch(() => {});
    onDisconnect(r).remove().catch(() => {});
    escribiendoActivo = r;
  }
  clearTimeout(tEscribiendo);
  tEscribiendo = setTimeout(pararEscribir, 3000);
});
function pararEscribir() {
  clearTimeout(tEscribiendo);
  if (escribiendoActivo) { remove(escribiendoActivo).catch(() => {}); escribiendoActivo = false; }
}

// Zumbido
$('#btn-zumbido').addEventListener('click', async () => {
  const ahora = Date.now();
  if (ahora - ultimoZumbido < 10000) { aviso('Espera unos segundos antes de mandar otro zumbido.'); return; }
  ultimoZumbido = ahora;
  sonido('zumbido');
  temblar();
  try { await enviar({ type: 'buzz' }, 'Te ha enviado un zumbido', true); } catch {}
});

// Emoticones
$('#panel-emo').replaceChildren(...EMOS.map(([codigo, nombre]) => el('button', {
  type: 'button', title: `${nombre}  ${codigo}`, 'aria-label': nombre,
  onclick: () => {
    const ta = $('#texto');
    const ini = ta.selectionStart ?? ta.value.length;
    const fin = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, ini) + codigo + ' ' + ta.value.slice(fin);
    ta.selectionStart = ta.selectionEnd = ini + codigo.length + 1;
    $('#panel-emo').hidden = true;
    ta.focus();
  }
}, el('img', { src: EMO_IMG.get(codigo.toUpperCase()).src, alt: '' }))));
$('#btn-emo').addEventListener('click', () => { $('#panel-emo').hidden = !$('#panel-emo').hidden; });

// Fotos
$('#btn-foto').addEventListener('click', () => $('#input-foto').click());
$('#input-foto').addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try {
    const data = await comprimirFoto(f);
    await enviar({ type: 'photo', data }, '[Foto]');
  } catch (e) { if (!e.code) aviso(e.message || 'No se pudo enviar la foto.'); }
});

// Notas de voz
let grabador = null;
let trozos = [];
let tInicio = 0;
let tReloj = null;
let cancelado = false;
const MAX_VOZ = 120;

$('#btn-voz').addEventListener('click', () => { grabador ? terminarGrabacion() : iniciarGrabacion(); });
$('#voz-enviar').addEventListener('click', terminarGrabacion);
$('#voz-cancelar').addEventListener('click', cancelarGrabacion);

async function iniciarGrabacion() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    aviso('Este navegador no permite grabar audio.'); return;
  }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { aviso('Necesito permiso para usar el micrófono.'); return; }
  const tipos = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  const mime = tipos.find((t) => MediaRecorder.isTypeSupported(t));
  const opciones = { audioBitsPerSecond: 24000 };
  if (mime) opciones.mimeType = mime;
  try { grabador = new MediaRecorder(stream, opciones); }
  catch { grabador = new MediaRecorder(stream); }
  trozos = []; cancelado = false;
  const destino = chatAbierto;
  grabador.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };
  grabador.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(tReloj);
    const tipo = (grabador && grabador.mimeType) || mime || 'audio/webm';
    grabador = null;
    $('#grabando').hidden = true;
    $('#btn-voz').classList.remove('grabando-activo');
    if (cancelado || chatAbierto !== destino) return;
    const dur = Math.round((Date.now() - tInicio) / 1000);
    if (dur < 1) return;
    const blob = new Blob(trozos, { type: tipo });
    const data = await leerArchivoComoDataURL(blob);
    if (data.length > 950000) { aviso('La nota de voz quedó demasiado pesada. Prueba con una más corta.'); return; }
    try { await enviar({ type: 'voice', data, mime: blob.type, dur }, '[Nota de voz]'); } catch {}
  };
  grabador.start(1000);
  tInicio = Date.now();
  $('#grabando').hidden = false;
  $('#btn-voz').classList.add('grabando-activo');
  $('#grabando-tiempo').textContent = '0:00';
  tReloj = setInterval(() => {
    const s = Math.floor((Date.now() - tInicio) / 1000);
    $('#grabando-tiempo').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (s >= MAX_VOZ) terminarGrabacion();
  }, 500);
}
function terminarGrabacion() { if (grabador && grabador.state !== 'inactive') grabador.stop(); }
function cancelarGrabacion() { cancelado = true; terminarGrabacion(); }

// Menú de la conversación
$('#chat-menu-btn').addEventListener('click', () => { $('#chat-menu').hidden = !$('#chat-menu').hidden; });
$('#btn-eliminar-contacto').addEventListener('click', async () => {
  $('#chat-menu').hidden = true;
  const id = chatAbierto;
  const c = contactos.get(id);
  if (!c) return;
  if (!confirm(`¿Eliminar a ${c.perfil ? c.perfil.nick : 'este contacto'} de tus contactos? Ninguno de los dos podrá escribirle al otro hasta que se vuelvan a agregar.`)) return;
  try {
    const b = writeBatch(fs);
    b.delete(doc(fs, 'users', yo.uid, 'contacts', id));
    b.delete(doc(fs, 'users', id, 'contacts', yo.uid));
    await b.commit();
  } catch (e) { aviso(traducirError(e)); }
});

/* =========================================================
   Administrador
   ========================================================= */
let unsubPendientes = null;
let unsubCodigos = null;
let unsubUsuarios = null;

function escucharPendientes() {
  if (unsubPendientes) return;
  let primera = true;
  unsubPendientes = onSnapshot(query(collection(fs, 'users'), where('approved', '==', false)), (s) => {
    if (!primera) {
      s.docChanges().filter((ch) => ch.type === 'added' && !ch.doc.data().rejected).forEach((ch) => {
        sonido('solicitud');
        toast('Cuenta nueva en espera', ch.doc.data().nick + ' · ' + ch.doc.data().email, null, abrirAdmin);
      });
    }
    primera = false;
    pendientesAdmin = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted);
    const n = pendientesAdmin.filter((p) => !p.rejected).length;
    $('#admin-cuenta').textContent = String(n);
    $('#admin-cuenta').hidden = !n;
    $('#admin-cuenta-2').textContent = n ? `(${n})` : '';
    pintarPendientes();
  }, (e) => console.error('Pendientes', e));
}
function detenerPendientes() { if (unsubPendientes) { unsubPendientes(); unsubPendientes = null; } }
function detenerAdmin() {
  detenerPendientes();
  if (unsubCodigos) { unsubCodigos(); unsubCodigos = null; }
  if (unsubUsuarios) { unsubUsuarios(); unsubUsuarios = null; }
}

function abrirAdmin() {
  if (!miPerfil || !miPerfil.admin) return;
  mostrarPestanaAdmin('pendientes');
  pintarPendientes();
  if (!unsubCodigos) {
    unsubCodigos = onSnapshot(query(collection(fs, 'invites'), orderBy('createdAt', 'desc')), (s) => pintarCodigos(s.docs),
      (e) => console.error('Códigos', e));
  }
  if (!unsubUsuarios) {
    unsubUsuarios = onSnapshot(collection(fs, 'users'), (s) => pintarUsuarios(s.docs), (e) => console.error('Usuarios', e));
  }
  $('#dlg-admin').showModal();
}
$('#btn-admin').addEventListener('click', abrirAdmin);
$('#dlg-admin').addEventListener('close', () => {
  if (unsubCodigos) { unsubCodigos(); unsubCodigos = null; }
  if (unsubUsuarios) { unsubUsuarios(); unsubUsuarios = null; }
});

function mostrarPestanaAdmin(nombre) {
  $$('[data-admin]').forEach((b) => b.classList.toggle('activa', b.dataset.admin === nombre));
  ['pendientes', 'codigos', 'usuarios'].forEach((n) => { $('#admin-' + n).hidden = n !== nombre; });
}
$$('[data-admin]').forEach((b) => b.addEventListener('click', () => mostrarPestanaAdmin(b.dataset.admin)));

function fechaCorta(t) {
  return t && t.toDate ? t.toDate().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

async function accionAdmin(promesa) {
  try { await promesa; } catch (e) { console.error(e); aviso(traducirError(e)); }
}

function pintarPendientes() {
  const cont = $('#admin-pendientes');
  const esperando = pendientesAdmin.filter((p) => !p.rejected);
  const rechazados = pendientesAdmin.filter((p) => p.rejected);
  const fila = (p, rechazado) => el('div', { class: 'fila-admin' },
    avatar(p, 40, null),
    el('div', { class: 'datos' }, el('b', {}, p.nick), el('br'), el('small', {}, `${p.email} · ${fechaCorta(p.createdAt)}`)),
    el('button', { type: 'button', class: 'boton-azul', onclick: () => accionAdmin(updateDoc(doc(fs, 'users', p.id), { approved: true, rejected: false })) }, 'Aprobar'),
    rechazado ? null : el('button', { type: 'button', class: 'boton-blanco', onclick: () => accionAdmin(updateDoc(doc(fs, 'users', p.id), { rejected: true })) }, 'Rechazar'));
  const nodos = [];
  if (!esperando.length) nodos.push(el('p', { class: 'admin-vacio' }, 'No hay cuentas esperando aprobación.'));
  esperando.forEach((p) => nodos.push(fila(p, false)));
  if (rechazados.length) {
    nodos.push(el('h3', { style: 'font-size:14px;margin:18px 0 0;color:var(--gris)' }, 'Rechazadas'));
    rechazados.forEach((p) => nodos.push(fila(p, true)));
  }
  cont.replaceChildren(...nodos);
}

function enlaceApp() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function generarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const azar = new Uint32Array(6);
  crypto.getRandomValues(azar);
  return Array.from(azar, (n) => letras[n % letras.length]).join('');
}

$('#form-codigo-nuevo').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const etiqueta = $('#codigo-etiqueta').value.trim();
  if (!etiqueta) return;
  const codigo = generarCodigo();
  try {
    await setDoc(doc(fs, 'invites', codigo), { label: etiqueta.slice(0, 60), createdAt: serverTimestamp(), createdBy: yo.uid, usedBy: null });
    $('#codigo-etiqueta').value = '';
  } catch (e) { aviso(traducirError(e)); }
});

function pintarCodigos(docs) {
  const cont = $('#lista-codigos');
  if (!docs.length) { cont.replaceChildren(el('p', { class: 'admin-vacio' }, 'Aún no has generado códigos.')); return; }
  cont.replaceChildren(...docs.map((d) => {
    const i = d.data();
    const usado = !!i.usedBy;
    const textoInvitacion = `¡Hola! Te invito a eMeSeNe, el chat de la familia y los amigos.\n1. Entra a ${enlaceApp()}\n2. Toca "Crear cuenta"\n3. Usa este código de invitación: ${d.id}`;
    return el('div', { class: 'fila-admin' },
      el('div', { class: 'datos' },
        el('span', { class: 'codigo-grande' }, d.id), ' ',
        usado ? el('span', { class: 'etiqueta-chip alerta' }, 'Usado') : el('span', { class: 'etiqueta-chip' }, 'Disponible'),
        el('br'),
        el('small', {}, `${i.label || ''}${usado ? ' · usado por ' + (i.usedEmail || '') : ''}`)),
      usado ? null : el('button', {
        type: 'button', class: 'boton-blanco', onclick: async (ev) => {
          try { await navigator.clipboard.writeText(textoInvitacion); ev.target.textContent = 'Copiado'; setTimeout(() => { ev.target.textContent = 'Copiar invitación'; }, 2000); }
          catch { prompt('Copia este texto:', textoInvitacion); }
        }
      }, 'Copiar invitación'),
      el('button', { type: 'button', class: 'boton-blanco', onclick: () => { if (confirm('¿Eliminar el código ' + d.id + '?')) accionAdmin(deleteDoc(doc(fs, 'invites', d.id))); } }, 'Eliminar'));
  }));
}

async function restablecerClave(u) {
  if (!confirm(`¿Enviar a ${u.nick} un correo para crear una contraseña nueva?\n\nLe llegará a ${u.email}. La contraseña actual sigue sirviendo hasta que la cambie.`)) return;
  try {
    await sendPasswordResetEmail(auth, u.email);
    aviso(`Listo, le enviamos el correo a ${u.email}. Dile que revise también la carpeta de spam.`);
  } catch (e) { aviso(traducirError(e)); }
}

async function eliminarUsuario(u) {
  if (!confirm(`¿Eliminar a ${u.nick} (${u.email})?\n\nSe quitará de los contactos de todos y no podrá volver a entrar. Sus mensajes antiguos se conservan.`)) return;
  try {
    const b = writeBatch(fs);
    const rels = await getDocs(collection(fs, 'users', u.id, 'contacts'));
    rels.forEach((r) => { b.delete(r.ref); b.delete(doc(fs, 'users', r.id, 'contacts', u.id)); });
    const enviadas = await getDocs(query(collection(fs, 'requests'), where('from', '==', u.id)));
    const recibidas = await getDocs(query(collection(fs, 'requests'), where('to', '==', u.id)));
    enviadas.forEach((d) => b.delete(d.ref));
    recibidas.forEach((d) => b.delete(d.ref));
    b.update(doc(fs, 'users', u.id), { suspended: true, deleted: true, admin: false });
    await b.commit();
    aviso(`${u.nick} fue eliminado.`);
  } catch (e) { console.error(e); aviso(traducirError(e)); }
}

function pintarUsuarios(docs) {
  const cont = $('#admin-usuarios');
  const todos = docs.map((d) => ({ id: d.id, ...d.data() }));
  const usuarios = todos.filter((u) => u.approved && !u.deleted)
    .sort((a, b) => (a.nick || '').localeCompare(b.nick || '', 'es'));
  const eliminados = todos.filter((u) => u.deleted);
  const nodos = [el('p', { class: 'ayuda', style: 'margin:0 0 6px' },
    'Por seguridad, nadie puede ver ni escribir la contraseña de otra persona. "Restablecer clave" le envía un correo para que cree una nueva.')];
  if (!usuarios.length) nodos.push(el('p', { class: 'admin-vacio' }, 'No hay usuarios aprobados.'));
  nodos.push(...usuarios.map((u) => {
    const soyYo = u.id === yo.uid;
    return el('div', { class: 'fila-admin' },
      avatar(u, 40, null),
      el('div', { class: 'datos' },
        el('b', {}, u.nick), u.admin ? el('span', { class: 'etiqueta-chip' }, 'Admin') : null,
        u.suspended ? el('span', { class: 'etiqueta-chip alerta' }, 'Suspendido') : null,
        el('br'), el('small', {}, `${u.email} · desde ${fechaCorta(u.createdAt)}`)),
      el('button', { type: 'button', class: 'boton-blanco', onclick: () => restablecerClave(u) }, 'Restablecer clave'),
      soyYo ? null : el('button', {
        type: 'button', class: 'boton-blanco',
        onclick: () => { if (u.suspended || confirm(`¿Suspender a ${u.nick}? No podrá usar eMeSeNe hasta que lo reactives.`)) accionAdmin(updateDoc(doc(fs, 'users', u.id), { suspended: !u.suspended })); }
      }, u.suspended ? 'Reactivar' : 'Suspender'),
      soyYo ? null : el('button', {
        type: 'button', class: 'boton-blanco',
        onclick: () => { if (confirm(u.admin ? `¿Quitar los permisos de administrador a ${u.nick}?` : `¿Dar permisos de administrador a ${u.nick}? Podrá aprobar cuentas, generar códigos y suspender usuarios.`)) accionAdmin(updateDoc(doc(fs, 'users', u.id), { admin: !u.admin })); }
      }, u.admin ? 'Quitar admin' : 'Hacer admin'),
      soyYo ? null : el('button', { type: 'button', class: 'boton-blanco peligro', onclick: () => eliminarUsuario(u) }, 'Eliminar'));
  }));
  if (eliminados.length) {
    nodos.push(el('h3', { style: 'font-size:14px;margin:18px 0 0;color:var(--gris)' }, 'Eliminados'));
    nodos.push(...eliminados.map((u) => el('div', { class: 'fila-admin' },
      avatar(u, 40, null),
      el('div', { class: 'datos' }, el('b', {}, u.nick), el('br'), el('small', {}, u.email)),
      el('button', {
        type: 'button', class: 'boton-blanco',
        onclick: () => { if (confirm(`¿Restaurar la cuenta de ${u.nick}? Podrá volver a entrar, pero tendrá que agregar de nuevo a sus contactos.`)) accionAdmin(updateDoc(doc(fs, 'users', u.id), { suspended: false, deleted: false })); }
      }, 'Restaurar'))));
  }
  cont.replaceChildren(...nodos);
}

/* =========================================================
   Instalación (PWA)
   ========================================================= */
let eventoInstalar = null;
const esIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esAndroid = () => /android/i.test(navigator.userAgent);
const instalada = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const plataformaActual = () => (esIos() ? 'iphone' : esAndroid() ? 'android' : 'pc');

const PASOS = {
  android: [
    'Abre <b>luisleytonjohns.github.io/emesene</b> en <b>Chrome</b>.',
    'Si aparece el aviso <b>Instalar</b> abajo, tócalo. Si no, toca los <b>tres puntos</b> arriba a la derecha.',
    'Elige <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.',
    'Confirma con <b>Instalar</b>. El ícono de eMeSeNe quedará junto a tus otras apps.'
  ],
  pc: [
    'Abre <b>luisleytonjohns.github.io/emesene</b> en <b>Chrome</b> o <b>Edge</b>.',
    'Haz clic en el ícono de <b>instalar</b> que aparece al final de la barra de direcciones (una pantalla con una flecha).',
    'Si no lo ves, abre el menú de los <b>tres puntos</b> y busca <b>Instalar eMeSeNe</b>. En Chrome puede estar dentro de <b>Transmitir, guardar y compartir</b>.',
    'Para que se abra sola al prender el computador: escribe <b>chrome://apps</b> en la barra, haz clic derecho sobre eMeSeNe y marca <b>Abrir al iniciar sesión</b>.'
  ],
  iphone: [
    'Abre <b>luisleytonjohns.github.io/emesene</b> en <b>Safari</b>.',
    'Toca el botón <b>Compartir</b> (el cuadrado con una flecha hacia arriba).',
    'Baja en la lista y toca <b>Agregar a pantalla de inicio</b>.',
    'Toca <b>Agregar</b>. Desde ahora abre eMeSeNe con ese ícono; así también funcionarán los avisos cuando los activemos.'
  ]
};

function mostrarPlataforma(nombre) {
  $$('[data-plataforma]').forEach((b) => b.classList.toggle('activa', b.dataset.plataforma === nombre));
  const lista = el('ol', {});
  PASOS[nombre].forEach((p) => { const li = el('li'); li.innerHTML = p; lista.append(li); });
  $('#instalar-pasos').replaceChildren(lista);
  $('#instalar-ahora').hidden = !(eventoInstalar && nombre === plataformaActual());
}

function abrirInstalar(nombre) {
  if (instalada()) { aviso('eMeSeNe ya está instalada en este equipo.'); }
  mostrarPlataforma(nombre || plataformaActual());
  $('#dlg-instalar').showModal();
}

$$('[data-instalar]').forEach((b) => b.addEventListener('click', () => abrirInstalar(b.dataset.instalar)));
$$('[data-plataforma]').forEach((b) => b.addEventListener('click', () => mostrarPlataforma(b.dataset.plataforma)));
$('#btn-instalar').hidden = instalada();
$('#btn-instalar').addEventListener('click', () => abrirInstalar());

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  eventoInstalar = ev;
});
$('#instalar-ahora').addEventListener('click', async () => {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice.catch(() => {});
  eventoInstalar = null;
  $('#dlg-instalar').close();
});
window.addEventListener('appinstalled', () => {
  $('#btn-instalar').hidden = true;
  eventoInstalar = null;
});

function mostrarAvisoIos() {
  let visto = false;
  try { visto = localStorage.getItem('avisoIos') === '1'; } catch {}
  $('#aviso-ios').hidden = !(esIos() && !instalada() && !visto);
}
$('#cerrar-aviso-ios').addEventListener('click', () => {
  $('#aviso-ios').hidden = true;
  try { localStorage.setItem('avisoIos', '1'); } catch {}
});
$('#ver-instalar-ios').addEventListener('click', () => abrirInstalar('iphone'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker', e));
  });
}
