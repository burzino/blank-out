// Configurazione di build. Il Client ID OAuth (tipo "Applicazione web", origine https://burzi.eu)
// si imposta in .env come VITE_GOOGLE_CLIENT_ID: è pubblico per natura, non è un segreto.
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
