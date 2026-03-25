import { useAuth } from "@/providers/AuthProvider";

export function TeamSwitcher() {
  const { teamSwitcherTeams, effectiveTeamId, setActiveTeam, loading } = useAuth();

  if (loading || teamSwitcherTeams.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-600 whitespace-nowrap">Team</span>
      <select
        className="rounded border px-2 py-1 max-w-[14rem]"
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
