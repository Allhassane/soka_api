export interface StructureComparison {
  structures: {
    uuid: string;
    name: string;
    level_name: string;
    total_members: number;
    responsibles_count: number;
    sub_groups_count: number;
    avg_members_per_subgroup: number;
    coverage_rate: number;
  }[];
  best_performer: string;
  needs_attention: string[];
  ranking: {
    by_members: string[];
    by_coverage: string[];
    by_avg_members: string[];
  };
}
