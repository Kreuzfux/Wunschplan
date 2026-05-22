import { useTheme } from "@/providers/ThemeProvider";

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      <span className="whitespace-nowrap font-medium">Darstellung</span>
      <select
        className="select max-w-[9rem] py-1.5 text-xs"
        value={preference}
        onChange={(e) => setPreference(e.target.value as "light" | "dark" | "system")}
        aria-label="Farbschema"
      >
        <option value="system">Automatisch</option>
        <option value="light">Hell</option>
        <option value="dark">Dunkel</option>
      </select>
    </label>
  );
}
