export interface IElectronAPI {
  quitApp: () => void
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}

interface WavedashSDK {
  init(options?: { debug?: boolean }): void;

  updateLoadProgressZeroToOne(progress: number): void;
}

declare global {
  interface Window {
    WavedashJS: Promise<WavedashSDK>;
  }
}

declare module 'virtual:campaign-overrides' {
  // Map of stage-id (as string keys, since JSON) → MawStage. Authored by
  // the level editor via the dev-only Vite plugin and seeded as the
  // initial campaign-override layer.
  const overrides: Record<string, unknown>
  export default overrides
}