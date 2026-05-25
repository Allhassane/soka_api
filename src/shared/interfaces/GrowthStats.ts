export interface GrowthStats {
  period: string;
  start_date: string;
  end_date: string;
  new_members: number;
  departed_members: number;  // Membres partis
  net_growth: number;        // Croissance nette
  new_structures: number;
  growth_rate: number;
  cumulative_total: number;  // Total cumulé
  gohonzon_received: number; // Nouveaux gohonzon
}
