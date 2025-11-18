// Mettre à jour l'interface StructureMembersStats
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
    departments: {
      uuid: string;
      name: string;
      total: number;
      percentage: number;
    }[];
    divisions: {
      uuid: string;
      name: string;
      department_uuid: string;
      department_name: string;
      total: number;
      percentage: number;
    }[];
  };
  members: {
    uuid: string;
    matricule: string | null;
    firstname: string;
    lastname: string;
    gender: string;
    birth_date: Date | null;
    phone: string | null;
    email: string | null;
    structure_uuid: string;
    structure_name: string;
    department_uuid: string | null;
    department_name: string | null;
    division_uuid: string | null;
    division_name: string | null;
    has_gohonzon: boolean;
    membership_date: Date | null;
    responsibilities: {
      uuid: string;
      name: string;
    }[];
  }[];
}
