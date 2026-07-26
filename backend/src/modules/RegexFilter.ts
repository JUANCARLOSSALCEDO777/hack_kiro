/**
 * Filtro basado en patrones regex para detectar frases ofensivas,
 * amenazas, acoso y contenido inapropiado que el filtro de palabras
 * individuales no atrapa.
 *
 * No es exhaustivo a propósito — cubre patrones estructurales comunes.
 */
class RegexFilter {
  private static patterns: { regex: RegExp; category: string }[] = [];

  static loadPatterns(): void {
    this.patterns = [
      // --- Amenazas directas ---
      { regex: /te\s+voy\s+a\s+(matar|partir|romper|reventar|destrozar|acabar|chingar|madrea|deshacer)/i, category: 'threat' },
      { regex: /voy\s+a\s+(matarte|partirte|romperte|reventarte|destrozarte|acabarte)/i, category: 'threat' },
      { regex: /te\s+(mato|parto|rompo|reviento|destrozo|acabo)/i, category: 'threat' },
      { regex: /ojalá\s+(te\s+mueras|se\s+muera|te\s+maten|se\s+mueran|te\s+atropellen)/i, category: 'threat' },
      { regex: /ojala\s+(te\s+mueras|se\s+muera|te\s+maten|se\s+mueran|te\s+atropellen)/i, category: 'threat' },
      { regex: /mereces\s+(morir|la\s+muerte|que\s+te\s+maten)/i, category: 'threat' },
      { regex: /i('m\s+gonna|will)\s+kill\s+(you|u|ur|your)/i, category: 'threat' },
      { regex: /gonna\s+(kill|murder|shoot|stab|hurt)\s+(you|u|him|her|them)/i, category: 'threat' },
      { regex: /i\s+hope\s+you\s+(die|get\s+hit|get\s+cancer|rot)/i, category: 'threat' },
      { regex: /you\s+deserve\s+to\s+(die|suffer|rot|burn)/i, category: 'threat' },
      { regex: /kill\s*your\s*self/i, category: 'threat' },
      { regex: /go\s+(die|kill\s+yourself|hang\s+yourself|jump\s+off)/i, category: 'threat' },

      // --- Incitación al suicidio / autolesión ---
      { regex: /por\s+qué\s+no\s+te\s+(matas|suicidas|ahogas|cuelgas)/i, category: 'selfharm' },
      { regex: /porque\s+no\s+te\s+(matas|suicidas|ahogas|cuelgas)/i, category: 'selfharm' },
      { regex: /deberías\s+(matarte|suicidarte|morirte|colgarte)/i, category: 'selfharm' },
      { regex: /deberias\s+(matarte|suicidarte|morirte|colgarte)/i, category: 'selfharm' },
      { regex: /nadie\s+te\s+(quiere|va\s+a\s+extrañar|necesita|extrañaría)/i, category: 'selfharm' },
      { regex: /el\s+mundo\s+(estaría|estaria)\s+mejor\s+sin\s+ti/i, category: 'selfharm' },
      { regex: /the\s+world\s+(would\s+be|is)\s+better\s+without\s+you/i, category: 'selfharm' },
      { regex: /nobody\s+(loves|cares\s+about|needs|wants)\s+you/i, category: 'selfharm' },
      { regex: /you\s+should\s+(kill|hang|shoot|cut)\s+(yourself|urself)/i, category: 'selfharm' },
      { regex: /why\s+don.?t\s+you\s+(just\s+)?(die|kill\s+yourself|end\s+it)/i, category: 'selfharm' },

      // --- Insultos compuestos en español ---
      { regex: /hijo\s+de\s+(puta|perra|la\s+gran|tu\s+pinche|su\s+re)/i, category: 'insult' },
      { regex: /tu\s+(puta|pinche|maldita|jodida)\s+madre/i, category: 'insult' },
      { regex: /la\s+concha\s+de\s+tu/i, category: 'insult' },
      { regex: /me\s+cago\s+en\s+(tu|su|la|dios|todo)/i, category: 'insult' },
      { regex: /vete\s+a\s+la\s+(v+e+r+g+a+|mierda|chingada|concha)/i, category: 'insult' },
      { regex: /a\s+la\s+(v+e+r+g+a+|chingada|mierda)/i, category: 'insult' },
      { regex: /que\s+te\s+(jodan|follen|cojan|den|metan)/i, category: 'insult' },
      { regex: /eres\s+(una?\s+)?(mierda|basura|escoria|asco|porquería)/i, category: 'insult' },
      { regex: /pedazo\s+de\s+(mierda|basura|escoria|idiota|imbécil|animal)/i, category: 'insult' },
      { regex: /no\s+sirves\s+para\s+(nada|un\s+carajo|una\s+mierda)/i, category: 'insult' },
      { regex: /piece\s+of\s+(shit|crap|garbage|trash)/i, category: 'insult' },
      { regex: /you('re|\s+are)\s+(a\s+)?(piece\s+of\s+shit|worthless|pathetic|disgusting|garbage)/i, category: 'insult' },
      { regex: /son\s+of\s+a\s+(bitch|whore|gun)/i, category: 'insult' },
      { regex: /shut\s+(the\s+fuck|your\s+fucking|ur\s+fucking)\s+up/i, category: 'insult' },
      { regex: /get\s+(the\s+fuck|fucked)\s+(out|off|away)/i, category: 'insult' },

      // --- Acoso sexual ---
      { regex: /te\s+voy\s+a\s+(violar|coger|follar|meter)/i, category: 'sexual' },
      { regex: /quiero\s+(cogerte|follarte|violarte|metértela|meterte)/i, category: 'sexual' },
      { regex: /manda\s*(me)?\s*(nudes|foto|pack|desnud)/i, category: 'sexual' },
      { regex: /send\s*(me)?\s*(nudes|pics|tits|ass|dick\s*pic)/i, category: 'sexual' },
      { regex: /i('m\s+gonna|\s+will)\s+(rape|fuck|molest)\s+(you|u|her|him)/i, category: 'sexual' },
      { regex: /wanna\s+(fuck|bang|screw|bone)\s*(you|u|her|him)?/i, category: 'sexual' },
      { regex: /show\s+(me\s+)?(your|ur)\s+(tits|boobs|ass|pussy|dick|cock)/i, category: 'sexual' },
      { regex: /me\s+co+rro+/i, category: 'sexual' },
      { regex: /me\s+vengo/i, category: 'sexual' },
      { regex: /me\s+estoy\s+(corriendo|viniendo)/i, category: 'sexual' },
      { regex: /i('m\s+|\s+am\s+)(cumming|coming|gonna\s+cum)/i, category: 'sexual' },
      { regex: /te\s+(cojo|cogi|follo|follé|meto|meti)/i, category: 'sexual' },
      { regex: /hazme\s+(un\s+)?(oral|pete|sexo|el\s+amor)/i, category: 'sexual' },
      { regex: /dame\s+(más\s+|mas\s+)?duro/i, category: 'sexual' },
      { regex: /dame\s+(por\s+)?(atrás|atras|detras|detrás|el\s+culo)/i, category: 'sexual' },
      { regex: /gime\s+(para\s+mí|para\s+mi|más|mas|papi|mami)/i, category: 'sexual' },
      { regex: /ponte\s+(de\s+)?(perrito|en\s+cuatro|cuatro)/i, category: 'sexual' },
      { regex: /te\s+la\s+(meto|saco|clavo|ensarto|entierro)/i, category: 'sexual' },
      { regex: /méteme(la|lo|todo)/i, category: 'sexual' },
      { regex: /meteme(la|lo|todo)/i, category: 'sexual' },
      { regex: /acaba(me|le|te)\s*(dentro|encima|en\s+la\s+cara)?/i, category: 'sexual' },

      // --- Insultos con "me la pelas" y variantes ---
      { regex: /me\s+la\s+(pelas|chupas|mamas|comes|tragas|jalas)/i, category: 'insult' },
      { regex: /pela(me)?la/i, category: 'insult' },
      { regex: /chinga\s+tu\s+madre/i, category: 'insult' },
      { regex: /chinga\s+a\s+tu\s+(madre|mama|mamá|jefa)/i, category: 'insult' },
      { regex: /chingas\s+a\s+tu\s+madre/i, category: 'insult' },
      { regex: /vete\s+a\s+(chingar|la\s+chingada|la\s+verga|la\s+mierda)/i, category: 'insult' },
      { regex: /no\s+ma+me+s/i, category: 'insult' },
      { regex: /me\s+vale\s+(verga|madres|madre|vrg|vrga|pito|queso)/i, category: 'insult' },
      { regex: /me\s+vl\s+(vrg|vrga|verga|vga|madres|chrzo|chorizo|pta|pito)/i, category: 'insult' },
      { regex: /me\s+val?e?\s+(vrg|vrga|vga|chrzo|chorizo)/i, category: 'insult' },
      { regex: /vale\s+(verga|madres|madre|vrg|vrga|vga|pito)/i, category: 'insult' },
      { regex: /que\s+te\s+valga\s+(verga|madres)/i, category: 'insult' },
      { regex: /te\s+vale\s+(verga|madres|madre)/i, category: 'insult' },
      { regex: /vales\s+(verga|pura\s+verga|vrg|vrga|pito|madres)/i, category: 'insult' },
      { regex: /de\s+la\s+(verga|chingada)/i, category: 'insult' },
      { regex: /por\s+la\s+(verga|retaguardia)/i, category: 'insult' },
      { regex: /eres\s+un[a]?\s*(put[oa]|perr[oa]|zorr[oa]|cule?r[oa]|pendej[oa]|cabr[oó]n[a]?)/i, category: 'insult' },
      { regex: /pinche\s+(puto|puta|pendejo|pendeja|culero|culera|perro|perra|wey|guey|morro|morra|vieja|joto|maricon)/i, category: 'insult' },
      { regex: /puto\s+(el\s+que\s+lo\s+lea|amo|wey|guey)/i, category: 'insult' },
      { regex: /tu\s+(jefa|jefe|vieja|viejo)\s+(es\s+una?\s+)?(puta|zorra|perra)/i, category: 'insult' },
      { regex: /cállate\s+(alv|a\s+la\s+verga|pendej[oa]|put[oa]|cabr[oó]n)/i, category: 'insult' },
      { regex: /callate\s+(alv|a\s+la\s+verga|pendej[oa]|put[oa]|cabr[oó]n)/i, category: 'insult' },
      { regex: /te\s+rompo\s+(la\s+madre|el\s+hocico|la\s+jeta|todo)/i, category: 'insult' },
      { regex: /te\s+parto\s+(la\s+madre|el\s+hocico|la\s+jeta|todo)/i, category: 'insult' },

      // --- Discurso de odio / discriminación ---
      { regex: /mueran\s+(los|las|todos)/i, category: 'hate' },
      { regex: /muerte\s+a\s+(los|las|todos)/i, category: 'hate' },
      { regex: /hay\s+que\s+(matar|exterminar|eliminar)\s+a\s+(todos|los|las)/i, category: 'hate' },
      { regex: /(raza|razas)\s+(inferior|superiore?s?)/i, category: 'hate' },
      { regex: /gas\s+the\s+(jews|blacks|gays|muslims|immigrants)/i, category: 'hate' },
      { regex: /kill\s+all\s+(jews|blacks|whites|gays|muslims|women|men)/i, category: 'hate' },
      { regex: /death\s+to\s+(all|jews|blacks|whites|gays|muslims)/i, category: 'hate' },
      { regex: /(white|black|brown)\s+people\s+(should|need\s+to|must)\s+(die|be\s+killed|disappear)/i, category: 'hate' },
      { regex: /hitler\s+(was|did)\s+(right|nothing\s+wrong)/i, category: 'hate' },
      { regex: /heil\s+hitler/i, category: 'hate' },
      { regex: /sieg\s+heil/i, category: 'hate' },

      // --- Doxxing / amenazas personales ---
      { regex: /sé\s+dónde\s+vives/i, category: 'doxxing' },
      { regex: /se\s+donde\s+vives/i, category: 'doxxing' },
      { regex: /i\s+know\s+where\s+you\s+live/i, category: 'doxxing' },
      { regex: /i\s+have\s+your\s+(address|ip|location|info)/i, category: 'doxxing' },
      { regex: /tengo\s+tu\s+(dirección|direccion|ip|ubicación|ubicacion|información|info)/i, category: 'doxxing' },
      { regex: /te\s+voy\s+a\s+(encontrar|buscar|rastrear|localizar)/i, category: 'doxxing' },
      { regex: /i('m\s+gonna|\s+will)\s+(find|track|hunt|locate)\s+you/i, category: 'doxxing' },
      { regex: /your\s+(home|house|school|work)\s+address\s+is/i, category: 'doxxing' },

      // --- Spam / flood patterns ---
      { regex: /(.)\1{9,}/i, category: 'spam' },  // Más de 9 caracteres repetidos
      { regex: /(.{2,5})\1{4,}/i, category: 'spam' },  // Patrón repetido 4+ veces

      // --- Evasión de filtro (leetspeak / caracteres especiales / repetición) ---
      // \b evita falsos positivos dentro de palabras normales (ej: "computadora", "disputar")
      { regex: /\b[fph]+[uv4@]+[cks]+[kc]+\b/i, category: 'evasion' },
      { regex: /\b[s$5]+[h#]+[i!1]+[t7]+\b/i, category: 'evasion' },
      { regex: /\bn+[i!1]+[gq]{1,}[e3a@]+[r]+\b/i, category: 'evasion' },
      { regex: /\bp+[u0v1]+[t7]+[a@4]+\b/i, category: 'evasion' },
      { regex: /\bp+[u0v1]+[t7]+[o0]+\b/i, category: 'evasion' },
      { regex: /\bm+[i!1]+[e3]+[r]+[d]+[a@4]+\b/i, category: 'evasion' },
      { regex: /\bv+[e3]+[r]+[g]+[a@4]+\b/i, category: 'evasion' },
      { regex: /c+h+[i!1]+n+g+[a@4]+/i, category: 'evasion' },
      { regex: /p+[e3]+n+d+[e3]+j+[o0a@4]+/i, category: 'evasion' },
    ];
  }

  /**
   * Verifica si un mensaje coincide con algún patrón regex.
   * @param message El texto del usuario.
   * @returns Objeto con resultado y categoría si hay match.
   */
  static check(message: string): { flagged: boolean; category: string | null } {
    for (const { regex, category } of this.patterns) {
      if (regex.test(message)) {
        return { flagged: true, category };
      }
    }
    return { flagged: false, category: null };
  }

  /**
   * Método simple que solo retorna boolean (para uso similar a ProfanityFilter).
   */
  static hasProfanity(message: string): boolean {
    return this.check(message).flagged;
  }
}

// Carga los patrones al importar el módulo
RegexFilter.loadPatterns();

export { RegexFilter };
