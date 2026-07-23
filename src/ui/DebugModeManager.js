/**
 * DebugModeManager — Gestiona el toggle entre modo principal y modo debug.
 *
 * Controla la visibilidad del panel lil-gui mediante CSS (display: none/block)
 * sin destruir ni recrear la instancia. Registra un listener de teclado en
 * document para alternar con la tecla backtick (`).
 *
 * El panel se oculta al construir para que la experiencia inicie limpia.
 * Solo al presionar backtick se revela el panel de controles.
 */

// Elementos que bloquean el toggle cuando están enfocados
// (evita conflictos con inputs internos de lil-gui y otros campos de texto)
const BLOCKED_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

export class DebugModeManager {

    /**
     * @param {import('lil-gui').GUI} gui - Instancia de lil-gui creada por ModeSelector
     */
    constructor(gui) {
        // Validación temprana para fallar rápido si el GUI es inválido
        if (!gui || !gui.domElement) {
            throw new Error('DebugModeManager requiere una instancia de GUI válida con domElement montado');
        }

        this._gui = gui;
        this._debugActive = false;
        this._panels = [];

        // Captura el display original antes de ocultar (por si tiene un valor custom)
        this._originalDisplay = gui.domElement.style.display || '';

        // Ocultar inmediatamente — la experiencia arranca en Main_Mode
        gui.domElement.style.display = 'none';

        // Bind del handler para poder removerlo después en dispose
        this._handler = this._handleKeydown.bind(this);
        document.addEventListener('keydown', this._handler);
    }

    /** Maneja keydown filtrando inputs con foco y teclas que no son backtick */
    _handleKeydown(event) {
        if (event.key !== 'd' && event.key !== 'D') return;

        const tag = event.target.tagName;
        // Protección: no togglear si el foco está en un campo editable
        if (BLOCKED_TAGS.includes(tag) || event.target.isContentEditable) return;

        this.toggle();
    }

    /** Alterna entre Main_Mode y Debug_Mode */
    toggle() {
        // Guard: no operar si ya se hizo dispose
        if (!this._handler) return;

        this._debugActive = !this._debugActive;
        this._applyVisibility();
    }

    /** Fuerza Debug_Mode visible */
    show() {
        if (!this._handler) return;
        this._debugActive = true;
        this._applyVisibility();
    }

    /** Fuerza Main_Mode (panel oculto) */
    hide() {
        if (!this._handler) return;
        this._debugActive = false;
        this._applyVisibility();
    }

    /**
     * Registra un panel adicional que participa del ciclo show/hide.
     * @param {{ show: Function, hide: Function, dispose?: Function }} panel
     */
    registerPanel(panel) {
        if (!panel || typeof panel.show !== 'function' || typeof panel.hide !== 'function') {
            throw new TypeError('El panel debe implementar métodos show() y hide()');
        }
        this._panels.push(panel);

        // Sincronizar el panel con el estado actual
        if (this._debugActive) {
            panel.show();
        } else {
            panel.hide();
        }
    }

    /** Aplica la visibilidad al GUI y a todos los paneles registrados */
    _applyVisibility() {
        this._gui.domElement.style.display = this._debugActive ? this._originalDisplay : 'none';

        for (const panel of this._panels) {
            try {
                this._debugActive ? panel.show() : panel.hide();
            } catch (_) {
                // Un panel con error no debe romper el toggle de los demás
            }
        }
    }

    /** Remueve listener y limpia referencias. Idempotente. */
    dispose() {
        if (!this._handler) return;

        document.removeEventListener('keydown', this._handler);
        this._handler = null;

        // Dispose de paneles registrados (cada uno puede fallar independientemente)
        for (const panel of this._panels) {
            try {
                if (typeof panel.dispose === 'function') panel.dispose();
            } catch (_) { /* no propagar errores de paneles individuales */ }
        }

        this._panels = [];
        this._gui = null;
        this._debugActive = false;
    }
}
