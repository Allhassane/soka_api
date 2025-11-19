export interface StructureMembersStats {
  structure: {
    uuid: string;
    name: string;
    level_uuid: string | null;
    level_name: string;
    responsibles: {
      member_uuid: string;
      member_name: string;
      responsibility_uuid: string;
      responsibility_name: string;
    }[];
  };
  stats: {
    total_members: number;
    total_hommes: number;
    total_femmes: number;
    total_with_gohonzon: number;
    gohonzon_rate: number;
    total_responsibles: number;
    total_sub_structures: number;
    age_distribution: {
      '0-18': number;
      '19-35': number;
      '36-50': number;
      '51-65': number;
      '65+': number;
    };
    departments: any[];
    divisions: any[];
  };
  members: any[];
  pagination: {
    current_page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}