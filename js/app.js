/* ============================================================================
   App · Aduana Cuba Claro
   Datos → render de secciones, buscador de límites, calculadoras y Traductor IA
   ========================================================================== */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const fmt = n => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let DATOS = null;

  const ICONOS = {
    ok: '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alerta: '<svg class="icono a3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    lupa: '<svg class="icono a1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    caja: '<svg class="icono a1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    casa: '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    movil: '<svg class="icono a1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    rayo: '<svg class="icono a3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
    salud: '<svg class="icono a4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    cerebro: '<svg class="icono a1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>',
    calc: '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4"/></svg>',
    reloj: '<svg class="icono a1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    libro: '<svg class="icono a3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z"/><path d="M4 4v16"/></svg>'
  };

  /* ------------------------------- Arranque ------------------------------ */
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const r = await fetch('data/limites.json', { cache: 'no-cache' });
      DATOS = await r.json();
    } catch (e) { console.warn('No se pudo cargar limites.json', e); }

    pintaNormas();
    pintaLimites();
    pintaAranceles();
    pintaEnvios();
    await TraductorLeyes.init('data/entrenamiento.json');
    pintaGlosario();
    wireBuscador();
    wireCalculadoraComercial();
    wireCalculadoraEnvios();
    wireTraductor();
    rellenaAnios();
  });

  function rellenaAnios() {
    const y = new Date().getFullYear();
    $$('.anio').forEach(el => el.textContent = y);
  }

  /* -------------------------------- Normas ------------------------------- */
  function pintaNormas() {
    const cont = $('#normas'); if (!cont || !DATOS) return;
    cont.innerHTML = (DATOS.normas || []).map(n => `
      <div class="card">
        <h4>${ICONOS.libro}<span>${n.tipo}</span></h4>
        <p><b>Qué hace:</b> ${n.que_hace}</p>
        <p><b>En claro:</b> ${n.claro}</p>
      </div>`).join('');
  }

  /* ------------------------------- Límites ------------------------------- */
  function pintaLimites(filtro) {
    const cont = $('#tabla-limites'); if (!cont || !DATOS) return;
    const q = (filtro || '').toLowerCase();
    const filas = (DATOS.limites || []).filter(l =>
      !q || (l.categoria + ' ' + l.limite + ' ' + l.valor_ref + ' ' + l.notas).toLowerCase().includes(q));
    cont.innerHTML = filas.length ? filas.map(l => `
      <tr>
        <td><b>${l.categoria}</b>${l.notas ? `<div class="chico">${l.notas}</div>` : ''}</td>
        <td><span class="pill">${l.limite}</span></td>
        <td class="chico">${l.valor_ref || '-'}</td>
      </tr>`).join('') : `<tr><td colspan="3" class="chico">Sin resultados para “${filtro}”.</td></tr>`;
  }
  function wireBuscador() {
    const inp = $('#buscador'); if (!inp) return;
    inp.addEventListener('input', e => pintaLimites(e.target.value));
  }

  /* ------------------------------ Aranceles ------------------------------ */
  function pintaAranceles() {
    const cont = $('#aranceles'); if (!cont || !DATOS) return;
    cont.innerHTML = (DATOS.aranceles_progresivos || []).map(t => `
      <div class="card"><h4>${ICONOS.calc}<span>${(t.tarifa * 100)} %</span></h4><p>${t.texto}</p></div>`).join('')
      + `<div class="card"><h4>${ICONOS.caja}<span>30 % envíos postales</span></h4><p>Los paquetes que llegan por envío postal pagan 30 % sobre el excedente gravado.</p></div>`;
  }

  /* -------------------------------- Envíos ------------------------------- */
  function pintaEnvios() {
    const cont = $('#envios-cards'); if (!cont || !DATOS) return;
    const e = DATOS.envios;
    const cards = [
      { i: ICONOS.caja, t: 'Envío normal (mixto)', p: `Hasta ${e.limite_general_valor} USD de valor en aduana. Exentos los primeros ${e.exento_general.valor} USD o ${e.exento_general.peso_kg} kg. Al resto: 30 %.` },
      { i: ICONOS.ok, t: 'Envío SOLO esenciales', p: `Si la caja tiene únicamente alimentos, aseo, medicinas e insumos médicos: exenta hasta ${e.solo_esenciales_exento.valor} USD o ${e.solo_esenciales_exento.peso_kg} kg.` },
      { i: ICONOS.casa, t: 'Equipaje acompañado (tú viajas)', p: e.equipaje_acompanado_esenciales + ' Presenta los esenciales en un bulto separado.' },
      { i: ICONOS.reloj, t: 'Equipaje no acompañado', p: e.equipaje_no_acompanado_esenciales },
      { i: ICONOS.rayo, t: 'Plantas eléctricas (>900 W)', p: 'Autorizadas excepcionalmente por envíos “por encima del valor establecido” para esa vía.' },
      { i: ICONOS.calc, t: 'Valoración por peso', p: `Para misceláneas se calcula 1 kg = ${e.valoracion_kg} USD. No es un impuesto fijo de 10 USD por kg.` }
    ];
    cont.innerHTML = cards.map(c => `<div class="card"><h4>${c.i}<span>${c.t}</span></h4><p>${c.p}</p></div>`).join('');
  }

  /* ------------------------------ Calculadora ---------------------------- */
  function wireCalculadoraComercial() {
    const btn = $('#calc1-btn'); if (!btn) return;
    btn.addEventListener('click', () => {
      const valor = parseFloat($('#calc1-valor').value) || 0;
      const tramos = DATOS.aranceles_progresivos;
      let impuesto = 0, resto = valor, detalle = [];
      let prev = 0;
      tramos.forEach(t => {
        const desde = t.desde || 0, hasta = t.hasta || Infinity;
        const base = Math.min(valor, hasta) - Math.max(0, desde);
        if (base > 0) { const pago = base * t.tarifa; impuesto += pago; detalle.push(`${base} USD × ${t.tarifa * 100} % = ${fmt(pago)} USD`); }
        prev = hasta;
      });
      const servicios = valor * 0.02; // estimación de servicios aduaneros
      const total = impuesto + servicios;
      $('#calc1-res').innerHTML = `
        <div class="caja">
          <b>Resultado estimado</b>
          <div class="kpi">
            <div><b>${fmt(impuesto)} USD</b><span>arancel</span></div>
            <div><b>${fmt(servicios)} USD</b><span>servicios (est.)</span></div>
            <div><b>${fmt(total)} USD</b><span>total a pagar</span></div>
          </div>
          <ul>${detalle.map(d => `<li>${d}</li>`).join('')}</ul>
          <p class="nota">Cálculo orientativo según Resolución 197/2026. Los servicios aduaneros se estiman en 2 % y pueden variar. Confirma siempre en la aduana.</p>
        </div>`;
    });
  }

  function wireCalculadoraEnvios() {
    const btn = $('#calc2-btn'); if (!btn) return;
    btn.addEventListener('click', () => {
      const peso = parseFloat($('#calc2-peso').value) || 0;
      const soloEsenciales = $('#calc2-tipo').value === 'esenciales';
      const e = DATOS.envios;
      const valor = peso * e.valoracion_kg;
      let impuesto = 0, exento = 0, nota = '';
      if (soloEsenciales && valor <= e.solo_esenciales_exento.valor && peso <= e.solo_esenciales_exento.peso_kg) {
        exento = valor; impuesto = 0; nota = 'Caja de solo esenciales dentro del límite: exención total.';
      } else {
        exento = Math.min(valor, e.exento_general.valor);
        const gravado = Math.max(0, valor - exento);
        impuesto = gravado * 0.30;
        nota = soloEsenciales
          ? 'Supera el límite de esenciales (200 USD / 20 kg): pasa al régimen general.'
          : 'Régimen general: 30 USD exentos y 30 % al resto.';
        if (valor > e.limite_general_valor) nota += ' Además supera el límite de 500 USD de valor en aduana.';
      }
      $('#calc2-res').innerHTML = `
        <div class="caja">
          <b>Estimación del envío</b>
          <div class="kpi">
            <div><b>${fmt(valor)} USD</b><span>valor (peso × 10)</span></div>
            <div><b>${fmt(exento)} USD</b><span>exento</span></div>
            <div><b>${fmt(impuesto)} USD</b><span>impuesto</span></div>
          </div>
          <p class="nota">${nota}</p>
        </div>`;
    });
  }

  /* ------------------------- Traductor IA de leyes ----------------------- */
  function wireTraductor() {
    const btn = $('#tl-btn'); if (!btn) return;
    btn.addEventListener('click', () => {
      const texto = $('#tl-entrada').value.trim();
      if (texto.length < 40) { $('#tl-res').innerHTML = '<div class="caja">Escribe o pega un texto de ley un poco más largo (mínimo ~40 caracteres).</div>'; return; }
      const out = TraductorLeyes.traducir(texto, { datos: TraductorLeyes._datos });
      const subio = out.despues.indice - out.antes.indice;
      const pct = Math.max(0, Math.min(100, out.despues.indice));
      const chips = k => out.datos[k].length ? `<p class="chico"><b>${k}:</b> ${out.datos[k].join(' · ')}</p>` : '';
      $('#tl-res').innerHTML = `
        <div class="caja">
          <div class="badges">
            <span class="badge ok">Categoría: ${out.etiqueta} (${Math.round(out.confianza * 100)} % seg.)</span>
            <span class="badge">Legibilidad antes: ${out.antes.indice} — ${out.antes.nivel}</span>
            <span class="badge warn">Después: ${out.despues.indice} — ${out.despues.nivel}</span>
          </div>
          <div class="barra"><i style="width:${pct}%"></i></div>
          <p class="chico">El algoritmo subió la comprensión ${subio > 0 ? '+' + subio.toFixed(1) : subio.toFixed(1)} puntos.</p>
          <h4 style="margin-top:14px">Resumen en lenguaje claro</h4>
          <ul>${out.resumen.map(f => `<li>${f}</li>`).join('')}</ul>
          <h4>Lo que más te afecta</h4>
          <ul>${out.significados.map(f => `<li>${f}</li>`).join('')}</ul>
          <h4>Qué deberías hacer</h4>
          <ul>${out.acciones.map(a => `<li>${a}</li>`).join('')}</ul>
          <h4>Términos traducidos</h4>
          <div>${out.terminos.map(t => `<span class="chip">${t.termino} → ${t.claro}</span>`).join('') || '<span class="chico">No se detectaron términos difíciles.</span>'}</div>
          <h4>Datos importantes</h4>
          ${chips('dolares')}${chips('porcentajes')}${chips('pesos')}${chips('areas')}${chips('plazos')}${chips('unidades')}
          <div style="margin-top:14px">
            <span class="chico">¿La categoría no es correcta? Enséñale al algoritmo:</span>
            <select id="tl-corregir" style="max-width:260px;margin-top:6px"></select>
            <button class="sec" id="tl-ensena">Enseñar</button>
          </div>
        </div>`;
      const sel = $('#tl-corregir');
      sel.innerHTML = TraductorLeyes.CATEGORIAS.map(c => `<option value="${c}" ${c === out.categoria ? 'selected' : ''}>${TraductorLeyes.ETIQUETA_CAT[c]}</option>`).join('');
      $('#tl-ensena').addEventListener('click', () => {
        TraductorLeyes.corregir(texto, sel.value);
        $('#tl-ensena').textContent = 'Aprendido ✓';
        setTimeout(() => $('#tl-ensena').textContent = 'Enseñar', 1500);
      });
    });
  }

  /* ------------------------------- Glosario ------------------------------ */
  function pintaGlosario() {
    const cont = $('#glosario'); if (!cont) return;
    const dict = TraductorLeyes.diccionario(TraductorLeyes._datos);
    const claves = Object.keys(dict).sort();
    cont.innerHTML = claves.map(k => `<span class="chip"><b>${k}</b> → ${dict[k]}</span>`).join('');
    const inp = $('#glosario-buscar');
    if (inp) inp.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      cont.innerHTML = claves.filter(k => k.includes(q) || dict[k].toLowerCase().includes(q))
        .map(k => `<span class="chip"><b>${k}</b> → ${dict[k]}</span>`).join('');
    });
  }
})();
