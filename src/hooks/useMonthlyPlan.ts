import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MonthlyPlan } from "@/types";

export function useMonthlyPlans(teamId: string | null | undefined) {
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!teamId) {
        setPlans([]);
        setSelectedPlanId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("monthly_plans")
        .select("*")
        .eq("team_id", teamId)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) {
        setPlans([]);
        setSelectedPlanId(null);
        setLoading(false);
        return;
      }
      const nextPlans = (data ?? []) as MonthlyPlan[];
      setPlans(nextPlans);
      setSelectedPlanId((prev) => prev ?? nextPlans[0]?.id ?? null);
      setLoading(false);
    }
    void load();
  }, [teamId]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  return { plans, selectedPlanId, setSelectedPlanId, plan: selectedPlan, loading };
}
