export interface SchoolImport {
  code_school: string;
  id_dsps: string;
  name: string;
  old_name: string,
  //annee_scolaire: string;
  code_dsps: string;
  district: string;
  region: string;
  department: string;
  sous_prefecture: string;
  commune: string;
  locality: string;
  nature_localite: string;
  created_year: string;
  opened_year: string;

  code_dren: string;
  name_dren: string;
  code_dden: string;
  name_dden: string;
  code_iep: string;
  name_iep: string;
  sector: string;


  school_zone: string;
  milieu_structure: string;
  longitude: string;
  latitude: string;
  precision: string;
  founder_name: string;
  founder_phone: string;
  phone: string;
  email: string;
  address: string;
  school_status: string;
  school_regime: string;
  opened_code: string;
  town: string;
}

export interface ImportResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
  importedSchools: SchoolImport[];
}
