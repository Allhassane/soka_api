export class StructureDto {
  uuid: string;
  name: string;
  level: {
    uuid: string;
    name: string;
  };
  parent?: {
    uuid: string;
    name: string;
  };
}

export class ResponsibilityDto {
  uuid: string;
  name: string;
  slug: string;
  gender: string;
}

export class MemberDto {
  uuid: string;
  firstname: string;
  lastname: string;
  picture?: string;
  phone?: string;
  phone_whatsapp?: string;
  email?: string;
}

export class ResponsibleDto {
  responsibility: ResponsibilityDto;
  member: MemberDto;
}

export class CommitteeResponseDto {
  structure: StructureDto;
  responsibles: ResponsibleDto[];
  vacant_responsibilities: ResponsibilityDto[];
}
