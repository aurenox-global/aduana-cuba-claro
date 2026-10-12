/* ============================================================================
   Traductor de Leyes · motor ML en el navegador (sin servidores, sin API keys)
   ----------------------------------------------------------------------------
   Incluye:
     1) Normalizador de texto español (minúsculas, sin acentos, tokenizado)
     2) Clasificador Naive Bayes (aprende de data/entrenamiento.json)
        + aprendizaje en línea: si el usuario corrige la categoría, el modelo
          actualiza sus conteos y lo recuerda en localStorage.
     3) Resumidor extractivo TextRank + TF-IDF (frases más importantes)
     4) Simplificador léxico con diccionario jurídico → lenguaje claro
     5) Índice de legibilidad Fernández-Huerta (antes / después)
     6) Extractor de datos duros: USD, %, kg, m², plazos, unidades
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------ 1. Normalización ----------------------- */
  const STOPWORDS = new Set(('de la el los las un una unos unas y o u que en con por para se su sus del al es son ser esta este esto estos estas como mas menos muy sin sobre entre no ni lo le les me te nos os mi tu mis tus ya pero si tambien sus cual cuales quien quienes donde cuando cuanto cuanta todo toda todos todas otro otra otros otras mismo misma cada tal tan asi a ante bajo cabe contra desde hasta mediante durante segun salvo incluso aunque mientras porque pues luego entonces cualquier cualquier toda todos aquel aquella ello ellos ellas nosotras nosotros vosotros vosotras podra podran debera deberan seran sera han haya hayan sido estaba estaban fueran fueron sea sean tiene tienen puede pueden debe deben').split(/\s+/));
  const WORD_RE = /[a-z0-9áéíóúüñ%$.,;:()\-]+/g;

  function sinAcentos(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function normalizar(texto) {
    return sinAcentos(String(texto || '').toLowerCase());
  }
  function tokenizar(texto) {
    return (normalizar(texto).match(WORD_RE) || [])
      .map(t => t.replace(/^[.,;:()\-]+|[.,;:()\-]+$/g, ''))
      .filter(t => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  }
  function frases(texto) {
    return String(texto || '')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?;])\s+|\n+/)
      .map(f => f.trim())
      .filter(f => f.split(/\s+/).length >= 4);
  }

  /* ---------------------- 2. Clasificador Naive Bayes ------------------- */
  const CATEGORIAS = [
    'aduanas_viajes', 'envios_paquetes', 'medicinas_alimentos', 'tecnologia',
    'electrodomesticos', 'migracion', 'economia_impuestos', 'comunidad_derechos'
  ];
  const ETIQUETA_CAT = {
    aduanas_viajes: 'Aduana y viajes',
    envios_paquetes: 'Envíos y paquetes',
    medicinas_alimentos: 'Medicinas, alimentos y aseo',
    tecnologia: 'Tecnología y telecomunicaciones',
    electrodomesticos: 'Electrodomésticos y energía',
    migracion: 'Migración',
    economia_impuestos: 'Economía e impuestos',
    comunidad_derechos: 'Comunidad y derechos'
  };

  const MODELO = {
    docCount: {}, wordCount: {}, total: {}, vocab: new Set(), totalDocs: 0,
    aprender(texto, cat) {
      if (!CATEGORIAS.includes(cat)) return this;
      const tk = tokenizar(texto);
      this.docCount[cat] = (this.docCount[cat] || 0) + 1;
      this.parent = this.parent || {};
      this.parent[cat] = this.parent[cat] || {};
      this.total[cat] = this.total[cat] || 0;
      this.totalDocs++;
      tk.forEach(t => {
        this.parent[cat][t] = (this.parent[cat][t] || 0) + 1;
        this.total[cat]++;
        this.vocab.add(t);
      });
      return this;
    },
    /** Entrena y guarda el modelo aprendido en el navegador (aprendizaje continuo). */
    persistir() {
      try { localStorage.setItem('tl_modelo', JSON.stringify({ docCount: this.docCount, parent: this.parent, total: this.total, totalDocs: this.totalDocs, vocab: [...this.vocab] })); } catch (e) {}
    },
    cargar() {
      try {
        const raw = localStorage.getItem('tl_modelo');
        if (!raw) return this;
        const d = JSON.parse(raw);
        this.docCount = d.docCount || {}; this.parent = d.parent || {}; this.total = d.total || {};
        this.totalDocs = d.totalDocs || 0; (d.vocab || []).forEach(v => this.vocab.add(v));
      } catch (e) {}
      return this;
    },
    clasificar(texto) {
      const tk = tokenizar(texto);
      if (!tk.length) return { categoria: null, etiqueta: '-', confianza: 0 };
      const V = Math.max(this.vocab.size, 1);
      let mejor = null, mejorLog = -Infinity;
      const puntajes = {};
      CATEGORIAS.forEach(cat => {
        const nDocs = this.docCount[cat] || 0;
        if (!nDocs) return;
        const prior = Math.log(nDocs / Math.max(this.totalDocs, 1));
        const tot = this.total[cat] || 0;
        const bolsa = this.parent[cat] || {};
        let logP = prior, hits = 0;
        tk.forEach(t => {
          if (!this.vocab.has(t)) return;
          hits++;
          const c = bolsa[t] || 0;
          logP += Math.log((c + 1) / (tot + V));
        });
        if (!hits) return;
        puntajes[cat] = logP;
        if (logP > mejorLog) { mejorLog = logP; mejor = cat; }
      });
      if (!mejor) return { categoria: null, etiqueta: '-', confianza: 0 };
      // Confianza por softmax relativo
      const max = Math.max(...Object.values(puntajes));
      const exp = Object.entries(puntajes).map(([k, v]) => [k, Math.exp(v - max)]);
      const suma = exp.reduce((a, b) => a + b[1], 0);
      const conf = exp.find(e => e[0] === mejor)[1] / (suma || 1);
      return { categoria: mejor, etiqueta: ETIQUETA_CAT[mejor] || mejor, confianza: Math.round(conf * 100) / 100 };
    }
  };

  /* ------------------------- 3. Resumidor TextRank ----------------------- */
  function resumir(texto, n) {
    const fs = frases(texto);
    if (fs.length <= n) return fs.slice();
    const tokens = fs.map(f => tokenizar(f));
    // TF-IDF global
    const df = {}; tokens.forEach(tk => new Set(tk).forEach(t => df[t] = (df[t] || 0) + 1));
    const N = fs.length;
    const idf = t => Math.log(1 + N / (1 + (df[t] || 0)));
    // Similitud por solapamiento ponderado
    const sim = (a, b) => {
      const A = new Set(a), B = new Set(b);
      let s = 0;
      A.forEach(t => { if (B.has(t)) s += idf(t); });
      return s / (Math.sqrt(A.size * B.size) || 1);
    };
    const M = fs.map((_, i) => fs.map((__, j) => i === j ? 0 : sim(tokens[i], tokens[j])));
    let scores = fs.map(() => 1 / N);
    for (let it = 0; it < 20; it++) {
      const nxt = [];
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let j = 0; j < N; j++) {
          if (i === j || !M[j][i]) continue;
          const out = M[j].reduce((a, b) => a + b, 0);
          s += (out ? M[j][i] / out : 0) * scores[j];
        }
        nxt.push(0.15 / N + 0.85 * s);
      }
      scores = nxt;
    }
    // Score extra por densidad de palabras informativas
    scores = scores.map((s, i) => s * (1 + 0.4 * tokens[i].length / 20));
    const orden = fs.map((f, i) => i).sort((a, b) => scores[b] - scores[a]).slice(0, n).sort((a, b) => a - b);
    return orden.map(i => fs[i]);
  }

  /* --------------------- 4. Simplificador léxico ------------------------- */
  const DICCIONARIO_BASE = {
    'no comercial': 'para uso tuyo o de tu familia (no para vender)',
    'sin caracter comercial': 'para ti o tu familia, no para venderlo',
    'importacion': 'traer productos del extranjero a Cuba',
    'arancel': 'impuesto de aduana',
    'arancelario': 'de los impuestos de aduana',
    'impuesto aduanero': 'dinero que te cobra la aduana',
    'despacho aduanero': 'trámite en la aduana para que entren tus cosas',
    'segundo despacho': 'trámite aparte cuando traes más de lo permitido',
    'caracter comercial': 'que es para vender, no para uso personal',
    'persona natural': 'una persona común, no una empresa',
    'mercancia': 'productos o cosas',
    'excedente': 'lo que sobra por encima del límite',
    'exento': 'que no paga impuesto',
    'exencion': 'permiso para no pagar impuesto',
    'gravamen': 'impuesto',
    'reembarque': 'devolver la mercancía de donde vino',
    'titular': 'dueño de la mercancía',
    'derogar': 'dejar sin efecto una ley anterior',
    'decreto-ley': 'ley aprobada por el gobierno',
    'decreto ley': 'ley aprobada por el gobierno',
    'gaceta oficial': 'boletín donde se publican las leyes',
    'entrada en vigor': 'fecha en que la ley empieza a aplicarse',
    'a los efectos de': 'para',
    'en su condicion de': 'actuando como',
    'podra': 'puede', 'debera': 'debe (obligatorio)', 'deberan': 'deben (obligatorio)',
    'a tenor de': 'según', 'conforme a': 'de acuerdo con', 'en virtud de': 'por medio de',
    'salvo': 'excepto', 'sin perjuicio de': 'sin afectar', 'al efecto': 'para eso',
    'faculta': 'da el derecho a', 'procedente': 'que sí se permite',
    'improcedente': 'que no se permite', 'reiteracion': 'volver a hacer lo mismo',
    'sancion': 'castigo o multa', 'medida administrativa': 'decisión de la autoridad',
    'subsanar': 'corregir', 'expedir': 'emitir o entregar', 'no obstante': 'aunque',
    'asimismo': 'también', 'en tal sentido': 'por eso', 'en aras de': 'para',
    'excepcionalmente': 'solo como excepción', 'caracter temporal': 'que dura un tiempo',
    'prorroga': 'extensión del plazo', 'infraccion': 'falta o incumplimiento',
    'delito': 'falta grave', 'inspeccion': 'revisión de la aduana',
    'deposito': 'almacén', 'custodia': 'cuando la aduana guarda tus cosas',
    'declaracion jurada': 'declaración firmada bajo tu responsabilidad',
    'en lo adelante': 'en el resto del texto', 'unidad de medida': 'forma de medir'
  };

  function diccionario(datos) {
    const d = Object.assign({}, DICCIONARIO_BASE);
    if (datos && datos.diccionario_legal) {
      Object.entries(datos.diccionario_legal).forEach(([k, v]) => { d[k] = v; });
    }
    return d;
  }

  function simplificarLexico(texto, dict) {
    let t = String(texto || '');
    const terminos = [];
    // Ordenar por longitud descendente para que gane la frase más específica
    const claves = Object.keys(dict).sort((a, b) => b.length - a.length);
    claves.forEach(k => {
      const re = new RegExp('\\b(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi');
      if (re.test(t)) {
        terminos.push({ termino: k, claro: dict[k] });
        t = t.replace(re, dict[k]);
      }
    });
    return { texto: t, terminos };
  }

  /* -------------------- 5. Legibilidad Fernández-Huerta ------------------ */
  function silabasPalabra(w) {
    w = normalizar(w).replace(/[^a-z]/g, '');
    if (!w) return 0;
    const grupos = w.match(/[aeiou]+/g);
    let n = grupos ? grupos.length : 0;
    if (n === 0) n = 1;
    return n;
  }
  function legibilidad(texto) {
    const palabras = (String(texto).match(/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+/g) || []);
    if (palabras.length < 10) return { indice: 0, nivel: 'sin datos' };
    const fs = frases(texto);
    const silabas = palabras.reduce((a, w) => a + silabasPalabra(w), 0);
    const P = silabas * 100 / palabras.length;
    const F = fs.length * 100 / palabras.length;
    const idx = Math.round((206.84 - 0.60 * P - 1.02 * F) * 10) / 10;
    let nivel = 'muy difícil (nivel universitario)';
    if (idx >= 90) nivel = 'muy fácil (cualquiera lo entiende)';
    else if (idx >= 80) nivel = 'fácil';
    else if (idx >= 70) nivel = 'algo fácil';
    else if (idx >= 60) nivel = 'normal';
    else if (idx >= 50) nivel = 'algo difícil';
    else if (idx >= 30) nivel = 'difícil (nivel de abogado)';
    return { indice: idx, nivel };
  }

  /* ----------------------- 6. Extractor de datos duros ------------------- */
  function extraerDatos(texto) {
    const t = String(texto);
    const out = { dolares: [], porcentajes: [], pesos: [], areas: [], plazos: [], unidades: [] };
    (t.match(/\b\d[\d.,]*\s*(?:usd|dólares|dolares|\$)/gi) || []).forEach(x => out.dolares.push(x.trim()));
    (t.match(/\b\d+(?:[.,]\d+)?\s*%/g) || []).forEach(x => out.porcentajes.push(x.trim()));
    (t.match(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilogramos|g|gramos)\b/gi) || []).forEach(x => out.pesos.push(x.trim()));
    (t.match(/\b\d+(?:[.,]\d+)?\s*m[²2]\b/gi) || []).forEach(x => out.areas.push(x.trim()));
    (t.match(/\b\d+\s*(?:d[ií]as?|meses|años|horas)\b/gi) || []).forEach(x => out.plazos.push(x.trim()));
    (t.match(/\b(?:hasta\s+)?\d+\s*(?:unidades?|equipos?|art[ií]culos?|tel[eé]fonos?|computadoras?|veces)\b/gi) || []).forEach(x => out.unidades.push(x.trim()));
    return out;
  }

  /* ------------------------- Traducción completa ------------------------- */
  function traducir(texto, opts) {
    opts = opts || {};
    const dict = diccionario(opts.datos);
    const limpio = simplificarLexico(texto, dict);
    const resumen = resumir(limpio.texto, opts.nFrases || 5);
    const cat = MODELO.clasificar(texto);
    const antes = legibilidad(texto);
    const despues = legibilidad(limpio.texto);

    // "Qué significa para ti" a partir de las frases con más datos duros
    const significados = resumen
      .map(f => ({ f, pesos: extraerDatos(f) }))
      .sort((a, b) => JSON.stringify(b.pesos).length - JSON.stringify(a.pesos).length)
      .slice(0, 3).map(x => x.f);

    const acciones = [];
    if (/debera|deberan|obligatorio|multa|sancion|prohibid/i.test(texto)) acciones.push('Fíjate en lo que dice "debe" o "no se permite": ahí están las obligaciones y las multas.');
    if (Object.keys(cat).length && cat.categoria) acciones.push('Revisa la sección “' + cat.etiqueta + '” de esta web para ver números y ejemplos.');
    if (extraerDatos(texto).dolares.length) acciones.push('Anota los valores en USD: son la base para calcular el impuesto en la calculadora.');
    if (extraerDatos(texto).plazos.length) acciones.push('Marca las fechas o plazos: la ley solo se aplica desde su entrada en vigor.');
    if (!acciones.length) acciones.push('Guarda esta ley y compárala con la Gaceta Oficial original antes de decidir.');

    return {
      titulo: 'Versión clara',
      categoria: cat.categoria, etiqueta: cat.etiqueta, confianza: cat.confianza,
      resumen, significados, acciones,
      terminos: limpio.terminos.slice(0, 40),
      datos: extraerDatos(texto),
      antes, despues,
      textoSimplificado: limpio.texto
    };
  }

  /* ------------------------------ API pública ---------------------------- */
  const API = {
    normalizar, tokenizar, frases, resumir, traducir, legibilidad, extraerDatos,
    diccionario, CATEGORIAS, ETIQUETA_CAT, MODELO,
    async init(urlEntrenamiento) {
      MODELO.cargar();
      try {
        const r = await fetch(urlEntrenamiento || 'data/entrenamiento.json', { cache: 'no-cache' });
        const datos = await r.json();
        (datos.ejemplos || []).forEach(e => MODELO.aprender(e.texto, e.cat));
        API._datos = datos;
        MODELO.persistir();
      } catch (e) { /* sin red: se usa el modelo guardado */ }
      return API;
    },
    /** El usuario corrige la categoría → el modelo aprende al instante. */
    corregir(texto, cat) { MODELO.aprender(texto, cat); MODELO.persistir(); }
  };

  global.TraductorLeyes = API;
})(window);
