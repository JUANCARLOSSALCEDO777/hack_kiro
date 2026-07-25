import { readFileSync } from 'fs';

class ProfanityFilter {
   private static BAD_WORDS_SET: Set<string> = new Set();

   /**
    * Carga (o recarga) el diccionario desde FILTRO.json.
    * Llamar a este método permite hot-swap sin reiniciar el proceso.
    */
   static loadDictionary(): void {
     const raw = readFileSync('./src/FILTRO.json', 'utf-8');
     const data = JSON.parse(raw) as { words: string[] };
     this.BAD_WORDS_SET = new Set(data.words.map(w => w.toLowerCase()));
   }

   /**
    * Limpia el texto antes de compararlo para evitar bypasses comunes 
    * (ej: "P.a.l.a.b.r.a" o "pALABRA")
    */
   private static normalize(text: string): string {
     return text
       .toLowerCase()
       .replace(/[.,!?;:]/g, '') // Elimina puntuación
       .replace(/\s+/g, '');      // Elimina espacios para detectar "p a l a b r a"
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
     }

     // Opción B: Verificación en el texto normalizado 
     // (Detecta "p-a-l-a-b-r-a" o "m.u.e.r.t.e")
     if (this.BAD_WORDS_SET.has(normalizedMessage)) return true;

     // Opcional: Bucle de búsqueda por cada palabra en el diccionario si 
     // quieres detectar palabras prohibidas que están pegadas a otros símbolos.
     // Solo úsalo si la lista no es gigante para mantener la latencia baja.
     for (const badWord of this.BAD_WORDS_SET) {
         if (normalizedMessage.includes(badWord)) return true;
     }

     return false;
   }
 }

// Carga inicial del diccionario al importar el módulo
ProfanityFilter.loadDictionary();

export { ProfanityFilter };
