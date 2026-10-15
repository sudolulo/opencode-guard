const MAX_PAGES = 200;

const present = (value) => typeof value === "string" && value.trim() !== "";

export const readSessionIdentity = async ({ sdk, directory, sessionID, maxPages = MAX_PAGES }) => {
  if (typeof sdk?.session?.messages !== "function") throw new Error("session identity API is unavailable");
  let before;
  const seen = new Set();
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const response = await sdk.session.messages({ sessionID, directory, limit: 50, ...(before ? { before } : {}) });
    if (response?.error) throw new Error(`identity ${sessionID}: message lookup failed`);
    const page = response?.data ?? response;
    if (!Array.isArray(page)) throw new Error(`identity ${sessionID}: message lookup returned no list`);
    const info = page.filter((message) => message?.info?.role === "user").at(-1)?.info;
    if (info) {
      const { agent, model } = info;
      if (!present(agent) || !present(model?.providerID) || !present(model?.modelID) ||
          (model.variant !== undefined && typeof model.variant !== "string")) {
        throw new Error(`identity ${sessionID}: newest user message is malformed`);
      }
      return { agent, model: { providerID: model.providerID, modelID: model.modelID },
        ...(model.variant ? { variant: model.variant } : {}) };
    }
    const next = response?.response?.headers?.get?.("x-next-cursor");
    if (!next) throw new Error(`identity ${sessionID}: no user message`);
    if (seen.has(next)) throw new Error(`identity ${sessionID}: repeated message cursor`);
    seen.add(next);
    before = next;
  }
  throw new Error(`identity ${sessionID}: history exceeds ${maxPages} pages`);
};
