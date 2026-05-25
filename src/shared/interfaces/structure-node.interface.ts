export interface ResponsibleInfo {
  member_uuid: string;
  member_name: string;
  responsibility_uuid: string;
  responsibility_name: string;
}

export interface StructureNode {
  uuid: string;
  name: string;
  level_uuid: string | null;
  level_name: string;
  parent_uuid: string | null;
  direct_members_count: number;
  total_members_count: number;
  sub_groups_count: number;
  sub_groups_uuids: string[];
  responsibles: ResponsibleInfo[];  // <-- Ajouté
  children: StructureNode[];
}
