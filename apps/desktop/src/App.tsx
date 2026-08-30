import { useEffect } from "react";
import { GamePage } from "./pages/GamePage";

function App() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    const blockKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blockedShortcut =
        event.key === "F5" ||
        event.key === "F12" ||
        ((event.ctrlKey || event.metaKey) && ["r", "i", "u", "j", "c", "g"].includes(key));

      if (blockedShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("keydown", blockKeys, { capture: true });
    document.addEventListener("contextmenu", blockContextMenu, { capture: true });
    window.addEventListener("beforeunload", beforeUnloadHandler);

    return () => {
      document.removeEventListener("keydown", blockKeys, { capture: true });
      document.removeEventListener("contextmenu", blockContextMenu, { capture: true });
      window.removeEventListener("beforeunload", beforeUnloadHandler);
    };
  }, []);

  return (
    <div className="min-h-screen font-custom bg-galatime-dark text-white">
      <GamePage />
    </div>
  );
}

export default App;
