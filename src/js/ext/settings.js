import { store } from "../shared/store";
import { MessageTypes, DefaultTracerTypes } from "../shared/constants";
import { generateUUID } from "../shared/ui-helpers";
export const settings = (() => {
  let disabled = false;

  // add the default tracers to the local storage
  store.set({ tracerPayloads: DefaultTracerTypes });

  // configQuery returns the appropriate configuration information
  // that is requested from the content script.
  const query = async ({ config }, _, sendResponse) => {
    switch (config) {
      case MessageTypes.GetTracerStrings.config:
        const tps = await getTracerStrings();
        sendResponse(tps.tracerPayloads);
        break;
      case MessageTypes.IsDisabled.config:
        sendResponse(disabled);
        break;
    }
  };

  const getTracerStrings = async () => await store.get({ tracerPayloads: [] });
  const getAPIKey = async () => {
    let { apiKey } = await store.get({ apiKey: "" });
    if (!apiKey) {
      apiKey = generateUUID();
      store.set({ apiKey: apiKey });
    }
    return apiKey;
  };

  return {
    getTracerStrings: getTracerStrings,
    getAPIKey: getAPIKey,
    isDisabled: () => disabled,
    setDisabled: (b) => (disabled = b),
    query: query,
  };
})();
