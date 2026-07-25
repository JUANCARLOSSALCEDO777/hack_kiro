import { readFileSync } from 'fs';

class ProfanityFilter {
   private static BAD_WORDS_SET: Set<string> = new Set();
   /** Set de palabras del diccionario sin vocales (para detectar abreviaciones tipo "chrzo", "vrg", "prr") */
   private static CONSONANT_SET: Set<string> = new Set();

   /**
    * Carga (o recarga) el diccionario desde FILTRO.json.
    * Llamar a este método permite hot-swap sin reiniciar el proceso.
    * Las palabras se guardan tanto en su forma original (lowercase) como
    * normalizadas (con caracteres repetidos colapsados) para cubrir ambos casos.
    */
   static loadDictionary(): void {
     const raw = readFileSync('./src/FILTRO.json', 'utf-8');
     const data = JSON.parse(raw) as { words: string[] };
     const words = data.words.map(w => w.toLowerCase());
     // Incluimos tanto la forma original como la normalizada (colapsada)
     const normalized = words.map(w => w.replace(/(.)\1+/g, '$1'));
     this.BAD_WORDS_SET = new Set([...words, ...normalized]);

     // Genera set de consonantes para palabras de 4+ letras (evita falsos positivos con cortas)
     this.CONSONANT_SET = new Set();
     for (const w of this.BAD_WORDS_SET) {
       if (w.length >= 4) {
         const consonants = w.replace(/[aeiouáéíóúü]/g, '');
         if (consonants.length >= 3) { // Solo si tiene al menos 3 consonantes
           this.CONSONANT_SET.add(consonants);
         }
       }
     }
   }

   /** Mapa de leetspeak / sustituciones comunes → letra real */
   private static readonly LEET_MAP: Record<string, string> = {
     '0': 'o',
     '1': 'i',
     '!': 'i',
     '3': 'e',
     '4': 'a',
     '@': 'a',
     '5': 's',
     '$': 's',
     '7': 't',
     '8': 'b',
     '9': 'g',
     'ñ': 'ñ', // preservar ñ
   };

   /**
    * Limpia el texto antes de compararlo para evitar bypasses comunes 
    * (ej: "P.a.l.a.b.r.a", "pALABRA", "veeeerga", "p1to", "m13rda")
    */
   private static normalize(text: string): string {
     return text
       .toLowerCase()
       .replace(/[0-9!@$]/g, (ch) => this.LEET_MAP[ch] ?? ch) // Traduce leetspeak primero
       .replace(/[.,;:'"*_\-#%^&(){}[\]|\\/<>~`+=]/g, '') // Elimina puntuación y símbolos restantes
       .replace(/\s+/g, '')      // Elimina espacios para detectar "p a l a b r a"
       .replace(/(.)\1+/g, '$1'); // Colapsa caracteres repetidos: "veeeerga" → "verga"
   }

   /**
    * Verifica si un mensaje contiene palabras prohibidas.
    * @param message El texto original del usuario.
    * @returns true si contiene contenido inapropiado.
    */
   static hasProfanity(message: string): boolean {
     const words = message.split(/\s+/); // Dividir por espacios reales
     const normalizedMessage = this.normalize(message);

     // Opción A: Verificación por palabras individuales (Alta precisión)
     for (const word of words) {
       if (this.BAD_WORDS_SET.has(word.toLowerCase())) return true;
       // También verificar la palabra normalizada individualmente
       const normalizedWord = this.normalize(word);
       if (this.BAD_WORDS_SET.has(normalizedWord)) return true;
       // Check consonantes: "chrzo" → consonantes "chrz" matchea con "chorizo" → "chrz"
       if (normalizedWord.length >= 3) {
         const consonants = normalizedWord.replace(/[aeiouáéíóúü]/g, '');
         if (consonants.length >= 3 && this.CONSONANT_SET.has(consonants)) return true;
       }
     }

     // Opción B: Verificación en el texto normalizado 
     // (Detecta "p-a-l-a-b-r-a" o "m.u.e.r.t.e")
     if (this.BAD_WORDS_SET.has(normalizedMessage)) return true;

     // Búsqueda de palabras prohibidas dentro del texto normalizado
     for (const badWord of this.BAD_WORDS_SET) {
         if (normalizedMessage.includes(badWord)) return true;
     }

     return false;
   }
 }

// Carga inicial del diccionario al importar el módulo
ProfanityFilter.loadDictionary();

export { ProfanityFilter };
