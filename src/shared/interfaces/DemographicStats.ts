export interface DemographicStats {
  structure_uuid: string;
  structure_name: string;
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
  avg_membership_duration_years: number;
  gohonzon_rate: number;
  members_with_responsibilities: number;
}
