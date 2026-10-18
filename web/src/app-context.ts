import type { ConfigJson, MeJson } from './types';
import type { MessageKey } from './locales/en-US';

export interface AppContext {
  me: MeJson | null;
  config: ConfigJson | null;
  reloadMe(): Promise<void>;
  rerender(): void;
  setTitle(key: MessageKey, params?: Record<string, string | number>): void;
}
