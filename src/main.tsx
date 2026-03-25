import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./providers/AuthProvider";
import { ThemeProvider } from "./providers/ThemeProvider";
import "./styles.css";

const BUILD_STORAGE_KEY = "wunschplan.build_id";
const buildId = import.meta.env.VITE_APP_BUILD_ID ?? "dev";

async function clearIndexedDbData() {
  if (!("indexedDB" in window)) return;
  const databasesApi = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };

  if (typeof databasesApi.databases === "function") {
    try {
      const dbs = await databasesApi.databases();
      await Promise.all(
        dbs
          .map((db) => db.name)
          .filter((name): name is string => Boolean(name))
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
              }),
          ),
      );
      return;
    } catch {
      // Ignore and fall back to known DB name.
    }
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("keyval-store");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearBrowserCaches() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // Ignore cache cleanup errors.
  }
}

async function resetClientStateOnNewBuild() {
  const previousBuildId = localStorage.getItem(BUILD_STORAGE_KEY);
  if (previousBuildId === buildId) return false;

  await clearIndexedDbData();
  await clearBrowserCaches();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(BUILD_STORAGE_KEY, buildId);
  return true;
}

async function bootstrap() {
  const shouldReload = await resetClientStateOnNewBuild();
  if (shouldReload) {
    window.location.reload();
    return;
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
