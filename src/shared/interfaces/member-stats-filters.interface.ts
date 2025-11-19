// src/shared/interfaces/member-stats-filters.interface.ts

export interface MemberStatsFilters {
  region_uuid?: string;
  centre_uuid?: string;
  chapitre_uuid?: string;
  district_uuid?: string;
  groupe_uuid?: string;
  department_uuid?: string;
  division_uuid?: string;
}

export interface MemberStatsResponse {
  filters_available: {
    regions: { uuid: string; name: string }[];
    centres: { uuid: string; name: string }[];
    chapitres: { uuid: string; name: string }[];
    districts: { uuid: string; name: string }[];
    groupes: { uuid: string; name: string }[];
  };
  stats: {
    total_members: number;
    total_hommes: number;
    total_femmes: number;
    departments: {
      total: number;
      hommes: number;
      femmes: number;
      jeunesse: number;
    };
    divisions: {
      total: number;
      jeune_homme: number;
      jeune_femme: number;
      avenir: number;
    };
  };
  breadcrumb: {
    region?: { uuid: string; name: string };
    centre?: { uuid: string; name: string };
    chapitre?: { uuid: string; name: string };
    district?: { uuid: string; name: string };
    groupe?: { uuid: string; name: string };
  };
}