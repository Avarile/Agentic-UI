// The endpoints config, mirrored into Recoil.
//
// The canonical copy lives in React Query (`useGetEndpointsQuery`); this mirror
// exists so non-React and selector code can read it synchronously.
//
// `defaultConfig` lists the known endpoints with `null` values so downstream code
// can iterate a stable key set before the real config arrives, and
// `endpointsFilter` reduces it to a plain "is this endpoint configured" booleans
// map for menu gating.

import { atom, selector } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';

const defaultConfig: TEndpointsConfig = {
  [EModelEndpoint.azureOpenAI]: null,
  [EModelEndpoint.azureAssistants]: null,
  [EModelEndpoint.assistants]: null,
  [EModelEndpoint.agents]: null,
  [EModelEndpoint.openAI]: null,
  [EModelEndpoint.google]: null,
  [EModelEndpoint.anthropic]: null,
  [EModelEndpoint.custom]: null,
};

const endpointsConfig = atom<TEndpointsConfig>({
  key: 'endpointsConfig',
  default: defaultConfig,
});

const endpointsQueryEnabled = atom<boolean>({
  key: 'endpointsQueryEnabled',
  default: true,
});

const endpointsFilter = selector({
  key: 'endpointsFilter',
  get: ({ get }) => {
    const config = get(endpointsConfig) || {};

    const filter = {};
    for (const key of Object.keys(config)) {
      filter[key] = !!config[key];
    }
    return filter;
  },
});

export default {
  endpointsConfig,
  endpointsFilter,
  defaultConfig,
  endpointsQueryEnabled,
};
