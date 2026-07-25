/**
 * Barrel export del módulo Experience Director.
 *
 * Centraliza las exportaciones para que el ExperienceManager
 * y otros consumidores importen desde un solo punto de entrada.
 */
export { EventBus } from './EventBus.js';
export { TransitionEngine } from './TransitionEngine.js';
export { VisualElementRegistry } from './VisualElementRegistry.js';
export { BeatRouter } from './BeatRouter.js';
export { PhaseManager } from './PhaseManager.js';
export { CameraSystem } from './CameraSystem.js';
export { ExperienceDirector } from './ExperienceDirector.js';
export { TimelineSequencer } from './TimelineSequencer.js';
