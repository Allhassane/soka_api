// src/shared/interfaces/ResponsibleStats.ts

export interface DepartmentSummary {
  uuid: string;
  name: string;
  total: number;
  percentage: number;
}

export interface DivisionSummary {
  uuid: string;
  name: string;
  department_uuid: string;
  department_name: string;
  total: number;
  percentage: number;
}

export interface StructureStats {
  uuid: string;
  name: string;
  level_name: string;
  direct_members: number;
  total_members: number;
  responsibles_count: number;
  sub_groups_count: number;
}

export interface DepartmentStats {
  uuid: string;
  name: string;
  members_count: number;
  percentage: number;
  divisions: DivisionStats[];
}

export interface DivisionStats {
  uuid: string;
  name: string;
  members_count: number;
  percentage: number;
}

export interface ResponsibleDashboard {
  responsible: {
    member_uuid: string;
    member_name: string;
    structure_uuid: string;
    structure_name: string;
    level_name: string;
  };

  summary: {
    total_members: number;
    total_structures: number;
    total_responsibles: number;
    members_with_gohonzon: number;
    gohonzon_rate: number;
    total_hommes: number;
    total_femmes: number;
    departments: DepartmentSummary[];
    divisions: DivisionSummary[];
  };

  structures_stats: StructureStats[];
  departments_stats: DepartmentStats[];

  gender_distribution: {
    homme: number;
    femme: number;
    ratio: string;
  };

  age_distribution: {
    '0-18': number;
    '19-35': number;
    '36-50': number;
    '51-65': number;
    '65+': number;
  };
}
