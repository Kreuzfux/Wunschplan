import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MonthlyPlan } from "@/types";

export function useMonthlyPlan() {
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("monthly_plans")
        .select("*")
        .in("status", ["open", "published"])
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPlan(data);
      setLoading(false);
    }
    void load();
  }, []);

  return { plan, loading };
}
