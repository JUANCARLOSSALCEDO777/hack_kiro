/**
 * MusicPlayer.js — Reproducción y análisis de audio
 * Equivalente a: La lógica de audio en LIGHTS.Loader + LIGHTS.Music
 * 
 * Usa Web Audio API para obtener datos de frecuencia en tiempo real
 * (el original usaba datos pre-grabados en una imagen PNG).
 */

export class MusicPlayer {

    constructor(src) {

        this.src = src;
        this.playing = false;
        this.currentTime = 0;
        this.analyser = null;
        this.frequencyData = null;

        this.setupAudio();
    }

    setupAudio() {

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audio = new Audio();
        this.audio.crossOrigin = 'anonymous';
        this.audio.src = this.src;
        this.audio.preload = 'auto';

        // Conectar al analyser para obtener espectro de frecuencias
        const source = this.audioContext.createMediaElementSource(this.audio);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 128;

        source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    }

    play() {
        // Algunos navegadores requieren interacción del usuario para reproducir audio
        const playPromise = this.audio.play();
        if (playPromise) {
            playPromise.catch(() => {
                // Si falla, esperar a un click del usuario
                const resume = () => {
                    this.audio.play();
                    this.audioContext.resume();
                    window.removeEventListener('click', resume);
                };
                window.addEventListener('click', resume);
            });
        }
        this.audioContext.resume();
        this.playing = true;
    }

    getFrequencyData() {
        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.frequencyData);
        }
        return this.frequencyData;
    }

    get time() {
        return this.audio.currentTime;
    }

    /**
     * Libera recursos de audio: detiene reproducción, limpia fuente
     * y cierra el AudioContext para evitar fugas de memoria.
     */
    dispose() {
        this.audio.pause();
        this.audio.src = '';
        this.playing = false;

        if (this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }
}
