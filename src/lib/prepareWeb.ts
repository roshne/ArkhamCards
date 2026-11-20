import type { Persistor } from 'redux-persist';

// Native builds need none of the web startup work in prepareWeb.web.ts.
export default async function prepareWeb(_persistor: Persistor): Promise<void> {}
