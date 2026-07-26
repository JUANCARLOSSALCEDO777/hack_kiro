import { readFileSync } from 'fs';

class ProfanityFilter {
   private static BAD_WORDS_SET: Set<string> = new Set();

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
    * Normaliza UNA palabra individual para comparación contra el diccionario.
    * Traduce leetspeak, elimina símbolos/puntuación y colapsa repetidos.
    */
   private static normalizeWord(word: string): string {
     return word
       .toLowerCase()
       .replace(/[0-9!@$]/g, (ch) => this.LEET_MAP[ch] ?? ch)
       .replace(/[.,;:'"*_\-#%^&(){}[\]|\\/<>~`+=]/g, '')
       .replace(/(.)\1+/g, '$1'); // Colapsa repetidos: "veeeerga" → "verga"
   }

   /**
    * Verifica si un mensaje contiene palabras prohibidas.
    * 
    * Estrategia: solo compara PALABRAS INDIVIDUALES contra el diccionario.
    * Esto evita falsos positivos por substrings en texto concatenado
    * (ej: "ESTOY VIENDO" ya no matchea con nada porque cada palabra
    * se evalúa por separado).
    * 
    * Palabras de 3 letras o menos se ignoran para evitar falsos positivos
    * con palabras comunes (ej: "con", "por", "que", "die", "ass").
    * 
    * @param message El texto original del usuario.
    * @returns true si contiene contenido inapropiado.
    */
   static hasProfanity(message: string): boolean {
     // Dividir por espacios y evaluar cada palabra individualmente
     const words = message.split(/\s+/);

     for (const word of words) {
       if (!word) continue;

       const lower = word.toLowerCase();

       // Ignorar palabras de 3 o menos caracteres — demasiado propensas a falsos positivos
       if (lower.length <= 3) continue;

       // Check 1: Palabra original en lowercase
       if (this.BAD_WORDS_SET.has(lower)) return true;

       // Check 2: Palabra normalizada (anti-leetspeak, anti-repetición)
       const normalizedWord = this.normalizeWord(word);
       if (normalizedWord.length > 3 && this.BAD_WORDS_SET.has(normalizedWord)) return true;
     }

     return false;
   }
 }

// Carga inicial del diccionario al importar el módulo
ProfanityFilter.loadDictionary();

export { ProfanityFilter };
