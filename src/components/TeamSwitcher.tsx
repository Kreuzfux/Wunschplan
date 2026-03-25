import { useAuth } from "@/providers/AuthProvider";

export function TeamSwitcher() {
  const { teamSwitcherTeams, effectiveTeamId, setActiveTeam, loading } = useAuth();

  if (loading || teamSwitcherTeams.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
      <span className="whitespace-nowrap font-medium">Team</span>
      <select
        className="select max-w-[16rem] text-sm"
        value={effectiveTeamId ?? ""}
        onChange={(e) => void setActiveTeam(e.target.value)}
      >
        {teamSwitcherTeams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
