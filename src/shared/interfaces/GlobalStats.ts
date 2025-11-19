export interface GlobalStats {
  total_structures: number;
  total_members: number;
  total_responsibles: number;
  structures_by_level: {
    level_uuid: string;
    level_name: string;
    count: number;
    members_count: number;
    avg_members_per_structure: number;
  }[];
  structures_without_responsibles: number;
  structures_without_members: number;
  top_5_structures_by_members: {
    uuid: string;
    name: string;
    level_name: string;
    total_members_count: number;
  }[];
}
